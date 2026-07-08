import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { InMemoryRateLimitStore, rateLimit, type RateLimitOptions } from '../middleware/rateLimit';

function buildApp(opts: Omit<RateLimitOptions, 'scope'> & { scope?: string }) {
  const app = new Hono();
  app.use('/*', rateLimit({ scope: 'test', ...opts }));
  app.get('/resource', (c) => c.json({ ok: true }));
  return app;
}

/** Simulates a Lambda Function URL request: sourceIp comes from the AWS event. */
function lambdaRequest(app: Hono, sourceIp: string, headers: Record<string, string> = {}) {
  return app.request('/resource', { headers }, {
    event: { requestContext: { http: { sourceIp } } },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    const app = buildApp({ windowMs: 60_000, max: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await lambdaRequest(app, '1.2.3.4');
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 with structured error once the limit is exceeded', async () => {
    const app = buildApp({ windowMs: 60_000, max: 2 });

    await lambdaRequest(app, '1.2.3.4');
    await lambdaRequest(app, '1.2.3.4');
    const res = await lambdaRequest(app, '1.2.3.4');

    expect(res.status).toBe(429);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, code: 'RATE_LIMITED', error: expect.any(String) });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('tracks clients independently by trusted IP', async () => {
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await lambdaRequest(app, '1.1.1.1');
    const blocked = await lambdaRequest(app, '1.1.1.1');
    const other = await lambdaRequest(app, '2.2.2.2');

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it('resets the counter after the window elapses', async () => {
    vi.useFakeTimers();
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await lambdaRequest(app, '1.2.3.4');
    expect((await lambdaRequest(app, '1.2.3.4')).status).toBe(429);

    vi.advanceTimersByTime(61_000);
    expect((await lambdaRequest(app, '1.2.3.4')).status).toBe(200);
  });

  it('ignores client-supplied X-Forwarded-For — rotating the header must not reset the window', async () => {
    // Bug this catches: keying on the first (client-controlled) XFF entry lets
    // an attacker get a fresh window per request on login/register/enrich by
    // sending a different fake IP each time.
    const app = buildApp({ windowMs: 60_000, max: 1 });

    const first = await app.request('/resource', { headers: { 'x-forwarded-for': '9.9.9.1' } });
    const second = await app.request('/resource', { headers: { 'x-forwarded-for': '9.9.9.2' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429); // same client despite rotated header
  });

  it('with trustProxy, keys on the rightmost XFF hop and ignores client-prepended entries', async () => {
    // Bug this catches: behind the ALB only the rightmost entry is appended by
    // the proxy itself; trusting any other position re-opens the spoof.
    const app = buildApp({ windowMs: 60_000, max: 1, trustProxy: true });

    const first = await app.request('/resource', { headers: { 'x-forwarded-for': 'fake-a, 10.0.0.9' } });
    const spoofRotated = await app.request('/resource', { headers: { 'x-forwarded-for': 'fake-b, 10.0.0.9' } });
    const differentClient = await app.request('/resource', { headers: { 'x-forwarded-for': 'fake-a, 10.0.0.7' } });

    expect(first.status).toBe(200);
    expect(spoofRotated.status).toBe(429); // same real hop → same window
    expect(differentClient.status).toBe(200); // genuinely different client
  });

  it('prefers the Lambda event sourceIp over any X-Forwarded-For header', async () => {
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await lambdaRequest(app, '3.3.3.3', { 'x-forwarded-for': 'spoof-1' });
    const rotated = await lambdaRequest(app, '3.3.3.3', { 'x-forwarded-for': 'spoof-2' });

    expect(rotated.status).toBe(429);
  });

  it('limiters with different scopes sharing one store count independently', async () => {
    // Bug this catches: with a single shared store, an unprefixed key would
    // make hits on /auth consume the /enrich budget and vice versa.
    const store = new InMemoryRateLimitStore();
    const authApp = buildApp({ windowMs: 60_000, max: 1, scope: 'auth', store });
    const enrichApp = buildApp({ windowMs: 60_000, max: 1, scope: 'enrich', store });

    expect((await lambdaRequest(authApp, '1.2.3.4')).status).toBe(200);
    expect((await lambdaRequest(enrichApp, '1.2.3.4')).status).toBe(200); // own budget
    expect((await lambdaRequest(authApp, '1.2.3.4')).status).toBe(429);
  });

  it('fails open when the store throws — an outage must not take the endpoint down', async () => {
    const store = { increment: () => Promise.reject(new Error('store down')) };
    const app = buildApp({ windowMs: 60_000, max: 1, store });

    expect((await lambdaRequest(app, '1.2.3.4')).status).toBe(200);
    expect((await lambdaRequest(app, '1.2.3.4')).status).toBe(200);
  });
});
