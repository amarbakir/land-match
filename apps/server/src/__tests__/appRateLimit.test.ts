import { describe, expect, it } from 'vitest';

import { createApp } from '../app';

function login(app: ReturnType<typeof createApp>, ip: string) {
  return app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({}), // invalid body → 400 before any DB access
  });
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
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.7.7.7' },
        body: JSON.stringify({}),
      });
      // Anonymous requests are rejected by requireAuth, but must still count
      // against the rate limit window (limiter runs before auth).
      expect(res.status).toBe(401);
    }

    const blocked = await app.request('/api/v1/listings/enrich', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '7.7.7.7' },
      body: JSON.stringify({}),
    });
    expect(blocked.status).toBe(429);
  });
});
