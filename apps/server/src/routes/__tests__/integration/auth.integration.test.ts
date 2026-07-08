import { describe, expect, it } from 'vitest';

import { createApp } from '../../../app';
import { pool } from '../../../db/client';

type Json = Record<string, unknown> & { ok: boolean; data?: any; code?: string };

function post(pathStr: string, body: unknown, headers: Record<string, string> = {}) {
  return createApp().request(pathStr, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function register(email: string, password = 'password123', name?: string) {
  const res = await post('/api/v1/auth/register', { email, password, name });
  return { res, body: (await res.json()) as Json };
}

describe('auth flow (integration)', () => {
  it('registers a user, stores an argon2id hash (never plaintext), and returns tokens', async () => {
    const { res, body } = await register('new@example.com', 'password123', 'New Person');

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();

    const { rows } = await pool.query('SELECT email, password_hash FROM users WHERE email = $1', ['new@example.com']);
    expect(rows).toHaveLength(1);
    // Bug this catches: storing the raw password, or a reversible encoding.
    expect(rows[0].password_hash).not.toBe('password123');
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a duplicate registration with 409 (real unique constraint)', async () => {
    await register('dup@example.com');
    const { res } = await register('dup@example.com');
    expect(res.status).toBe(409);
  });

  // Validates cge.6 normalization + cge.11 lower(email) unique index end-to-end —
  // behavior a mocked-repo unit test can't observe.
  it('treats case and whitespace variants of an email as the same account', async () => {
    const first = await register('Person@Example.com');
    expect(first.res.status).toBe(201);

    const second = await register('  person@example.COM ');
    expect(second.res.status).toBe(409);

    const { rows } = await pool.query('SELECT email FROM users');
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('person@example.com'); // stored normalized
  });

  it('logs in regardless of the email case the client sends', async () => {
    await register('login@example.com', 'password123');

    const res = await post('/api/v1/auth/login', { email: 'LOGIN@Example.com', password: 'password123' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.data.accessToken).toBeTruthy();
  });

  it('rejects wrong password and unknown email identically (no enumeration)', async () => {
    await register('real@example.com', 'password123');

    const wrong = await post('/api/v1/auth/login', { email: 'real@example.com', password: 'wrongpass1' });
    const unknown = await post('/api/v1/auth/login', { email: 'ghost@example.com', password: 'password123' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(((await wrong.json()) as Json).code).toBe(((await unknown.json()) as Json).code);
  });

  it('refreshes tokens, and the new access token actually authenticates a request', async () => {
    const { body } = await register('refresh@example.com');

    const good = await post('/api/v1/auth/refresh', { refreshToken: body.data.refreshToken });
    expect(good.status).toBe(200);
    const refreshed = (await good.json()) as Json;
    expect(refreshed.data.accessToken).toBeTruthy();

    // Bug this catches: a refresh that returns a malformed/unsigned access token
    // would still look "truthy" but fail on the next authenticated call. Use it
    // against an auth-gated endpoint and require a real 200.
    const authed = await createApp().request('/api/v1/search-profiles', {
      headers: { authorization: `Bearer ${refreshed.data.accessToken}` },
    });
    expect(authed.status).toBe(200);
  });

  it('rejects an invalid refresh token with 401', async () => {
    const bad = await post('/api/v1/auth/refresh', { refreshToken: 'not.a.valid.token' });
    expect(bad.status).toBe(401);
  });

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await post('/api/v1/auth/login', '{ bad json');
    expect(res.status).toBe(400);
    expect(((await res.json()) as Json).code).toBe('BAD_REQUEST');
  });
});
