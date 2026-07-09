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

describe('refresh token lifecycle (integration)', () => {
  it('rotates the refresh token; a racing reuse gets 401 but the session survives (grace window)', async () => {
    // Bug this catches: refresh minting new tokens while the old stays valid —
    // indefinite session extension. And the flip side: two browser tabs racing
    // a refresh must not hard-log the user out of everything.
    const { body } = await register('rotate@example.com');
    const original = body.data.refreshToken as string;

    const first = await post('/api/v1/auth/refresh', { refreshToken: original });
    expect(first.status).toBe(200);
    const rotated = ((await first.json()) as Json).data.refreshToken as string;
    expect(rotated).not.toBe(original);

    // Immediate reuse (a losing tab) is rejected but treated as benign...
    const reuse = await post('/api/v1/auth/refresh', { refreshToken: original });
    expect(reuse.status).toBe(401);

    // ...so the rotated descendant keeps working.
    const afterReuse = await post('/api/v1/auth/refresh', { refreshToken: rotated });
    expect(afterReuse.status).toBe(200);
  });

  it('reuse outside the grace window is theft — the whole family dies', async () => {
    // Bug this catches: a stolen refresh token replayed later. Both the stolen
    // token and everything rotated from it must be revoked.
    const { body } = await register('theft@example.com');
    const original = body.data.refreshToken as string;

    const first = await post('/api/v1/auth/refresh', { refreshToken: original });
    const rotated = ((await first.json()) as Json).data.refreshToken as string;

    // Age the rotation past the grace window.
    await pool.query(`UPDATE refresh_tokens SET rotated_at = now() - interval '10 minutes' WHERE rotated_at IS NOT NULL`);

    const reuse = await post('/api/v1/auth/refresh', { refreshToken: original });
    expect(reuse.status).toBe(401);

    // The attacker-or-victim's descendant token is dead too.
    const afterReuse = await post('/api/v1/auth/refresh', { refreshToken: rotated });
    expect(afterReuse.status).toBe(401);
  });

  it('logout revokes the session — the refresh token stops working', async () => {
    const { body } = await register('logout@example.com');
    const token = body.data.refreshToken as string;

    const res = await post('/api/v1/auth/logout', { refreshToken: token });
    expect(res.status).toBe(204);

    const after = await post('/api/v1/auth/refresh', { refreshToken: token });
    expect(after.status).toBe(401);
  });

  it('logout does not touch other sessions of the same user', async () => {
    // Bug this catches: revoking by user_id instead of family — logging out
    // of the extension would also kill the web app session.
    await register('twosessions@example.com');
    const second = await post('/api/v1/auth/login', { email: 'twosessions@example.com', password: 'password123' });
    const secondToken = (((await second.json()) as Json).data.refreshToken) as string;

    const first = await post('/api/v1/auth/login', { email: 'twosessions@example.com', password: 'password123' });
    const firstToken = (((await first.json()) as Json).data.refreshToken) as string;

    await post('/api/v1/auth/logout', { refreshToken: firstToken });

    const stillAlive = await post('/api/v1/auth/refresh', { refreshToken: secondToken });
    expect(stillAlive.status).toBe(200);
  });
});
