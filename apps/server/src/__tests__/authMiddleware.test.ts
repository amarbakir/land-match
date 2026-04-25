import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth, optionalAuth } from '../middleware/auth';
import * as jwt from '../lib/jwt';
import type { Env } from '../types/env';

vi.mock('../lib/jwt');

const mockJwt = vi.mocked(jwt);

/** Build a tiny app with the given middleware and a route that echoes userId. */
function buildApp(middleware: MiddlewareHandler<Env>) {
  const app = new Hono<Env>();
  app.use('/*', middleware);
  app.get('/protected', (c) => c.json({ userId: c.get('userId') ?? null }));
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('requireAuth', () => {
  const app = buildApp(requireAuth);

  it('returns 401 with structured error when no Authorization header is present', async () => {
    const res = await app.request('/protected');

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ ok: false, code: 'UNAUTHORIZED', error: expect.any(String) });
  });

  it('returns 401 for non-Bearer scheme', async () => {
    const res = await app.request('/protected', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.status).toBe(401);
    // verifyToken should never be called for a non-Bearer header
    expect(mockJwt.verifyToken).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token is empty', async () => {
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer ' },
    });

    expect(res.status).toBe(401);
    expect(mockJwt.verifyToken).not.toHaveBeenCalled();
  });

  // Bug: middleware that calls c.set('userId') before checking verifyToken result
  it('returns 401 when token verification fails', async () => {
    mockJwt.verifyToken.mockResolvedValue(null);

    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer expired-or-tampered' },
    });

    expect(res.status).toBe(401);
    expect(mockJwt.verifyToken).toHaveBeenCalledWith('expired-or-tampered', 'access');
  });

  it('sets userId on context and returns 200 for valid access token', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-42' });

    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBe('user-42');
  });
});

describe('optionalAuth', () => {
  const app = buildApp(optionalAuth);

  it('sets userId when valid token is provided', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-7' });

    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBe('user-7');
  });

  // Bug: optionalAuth that rejects unauthenticated requests instead of passing through
  it('returns 200 without userId when no Authorization header', async () => {
    const res = await app.request('/protected');

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBeNull();
  });

  // Bug: optionalAuth that throws on expired/invalid tokens instead of continuing anonymously
  it('returns 200 without userId for invalid token', async () => {
    mockJwt.verifyToken.mockResolvedValue(null);

    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBeNull();
    expect(mockJwt.verifyToken).toHaveBeenCalled();
  });

  // Bug: extractBearerToken crash on non-Bearer format breaking anonymous access
  it('returns 200 without userId for non-Bearer scheme', async () => {
    const res = await app.request('/protected', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.userId).toBeNull();
    expect(mockJwt.verifyToken).not.toHaveBeenCalled();
  });
});
