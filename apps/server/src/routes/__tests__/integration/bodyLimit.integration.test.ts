import { describe, expect, it } from 'vitest';

import { createApp } from '../../../app';

const app = createApp();

describe('request body limit (integration)', () => {
  // Bug this guards: every route buffers the whole body via c.req.json() —
  // without a global limit, one large (or many parallel large) bodies OOM the
  // process. All legitimate payloads are tiny (criteria JSON, addresses).
  it('rejects an oversized body with 413 and the standard error envelope', async () => {
    const bigBody = JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200 * 1024) });

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bigBody,
    });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('leaves normal-sized requests untouched', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'password123' }),
    });

    // 401 (bad credentials) — the limit must not interfere with the route
    expect(res.status).toBe(401);
  });
});
