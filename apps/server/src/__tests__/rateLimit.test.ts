import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rateLimit } from '../middleware/rateLimit';

function buildApp(opts: { windowMs: number; max: number }) {
  const app = new Hono();
  app.use('/*', rateLimit(opts));
  app.get('/resource', (c) => c.json({ ok: true }));
  return app;
}

function request(app: Hono, ip = '1.2.3.4') {
  return app.request('/resource', { headers: { 'x-forwarded-for': ip } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    const app = buildApp({ windowMs: 60_000, max: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await request(app);
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 with structured error once the limit is exceeded', async () => {
    const app = buildApp({ windowMs: 60_000, max: 2 });

    await request(app);
    await request(app);
    const res = await request(app);

    expect(res.status).toBe(429);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, code: 'RATE_LIMITED', error: expect.any(String) });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('tracks clients independently by IP', async () => {
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await request(app, '1.1.1.1');
    const blocked = await request(app, '1.1.1.1');
    const other = await request(app, '2.2.2.2');

    expect(blocked.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it('resets the counter after the window elapses', async () => {
    vi.useFakeTimers();
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await request(app);
    expect((await request(app)).status).toBe(429);

    vi.advanceTimersByTime(61_000);
    expect((await request(app)).status).toBe(200);
  });

  it('uses only the first entry of a forwarded chain', async () => {
    const app = buildApp({ windowMs: 60_000, max: 1 });

    await request(app, '9.9.9.9, 10.0.0.1');
    const res = await request(app, '9.9.9.9, 10.0.0.2');

    expect(res.status).toBe(429);
  });
});
