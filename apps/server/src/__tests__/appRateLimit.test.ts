import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { resetSharedRateLimitStore } from '../lib/sharedRateLimitStore';
// Distinct clients are simulated the way production sees them: via the trusted
// Lambda event sourceIp (X-Forwarded-For is client-controlled and ignored).
import { lambdaEnv } from './lambdaEnv';

// The rate-limit store is a process-wide singleton — without the reset, tests
// in this file would share spent windows and 429 depending on order.
beforeEach(() => {
  resetSharedRateLimitStore();
});

function login(app: ReturnType<typeof createApp>, ip: string) {
  return app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}), // invalid body → 400 before any DB access
  }, lambdaEnv(ip));
}

describe('app rate limiting', () => {
  it('rate limits auth endpoints per IP after 10 requests per minute', async () => {
    const app = createApp();

    for (let i = 0; i < 10; i++) {
      const res = await login(app, '5.5.5.5');
      expect(res.status).toBe(400);
    }

    const blocked = await login(app, '5.5.5.5');
    expect(blocked.status).toBe(429);

    const otherIp = await login(app, '6.6.6.6');
    expect(otherIp.status).toBe(400);
  });

  it('rate limits the enrichment endpoint after 20 requests per minute', async () => {
    const app = createApp();

    for (let i = 0; i < 20; i++) {
      const res = await app.request('/api/v1/listings/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }, lambdaEnv('7.7.7.7'));
      // Anonymous requests are rejected by requireAuth, but must still count
      // against the rate limit window (limiter runs before auth).
      expect(res.status).toBe(401);
    }

    const blocked = await app.request('/api/v1/listings/enrich', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }, lambdaEnv('7.7.7.7'));
    expect(blocked.status).toBe(429);
  });

  it('spoofed X-Forwarded-For does not buy a fresh window on auth endpoints', async () => {
    // Bug this catches: keying on the client-controlled XFF header lets a
    // credential-stuffing attacker rotate it per request and never hit 429.
    const app = createApp();

    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `1.2.3.${i}` },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    }

    const blocked = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.99' },
      body: JSON.stringify({}),
    });
    expect(blocked.status).toBe(429);
  });
});
