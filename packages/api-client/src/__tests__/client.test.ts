import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient, type TokenStorage, type Tokens } from '../client';

const BASE_URL = 'http://api.test';

function makeStorage(initial: Tokens | null) {
  let tokens = initial;
  return {
    getTokens: vi.fn(async () => tokens),
    setTokens: vi.fn(async (next: Tokens) => {
      tokens = next;
    }),
    clearTokens: vi.fn(async () => {
      tokens = null;
    }),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request basics', () => {
  it('prefixes /api/v1 and returns unwrapped data', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { items: [1, 2] } }));

    const result = await client.get<{ items: number[] }>('/listings/saved');

    expect(mockFetch.mock.calls[0][0]).toBe('http://api.test/api/v1/listings/saved');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('attaches Authorization header when tokens exist', async () => {
    const storage = makeStorage({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.get('/items');

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer acc-1');
  });

  // Bug guard: noAuth requests leaking the bearer token to public endpoints
  it('noAuth requests do not include Authorization header and skip storage', async () => {
    const storage = makeStorage({ accessToken: 'secret', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.post('/auth/login', { email: 'a@b.com', password: 'pw' }, { noAuth: true });

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(storage.getTokens).not.toHaveBeenCalled();
  });

  it('sets Content-Type only when a body is present', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.get('/items');
    await client.post('/items', { a: 1 });

    const getHeaders = new Headers(mockFetch.mock.calls[0][1]?.headers);
    const postHeaders = new Headers(mockFetch.mock.calls[1][1]?.headers);
    expect(getHeaders.get('Content-Type')).toBeNull();
    expect(postHeaders.get('Content-Type')).toBe('application/json');
    expect(mockFetch.mock.calls[1][1]?.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws ApiError carrying server message, status, and code', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(
      jsonResponse(409, { ok: false, code: 'EMAIL_ALREADY_EXISTS', error: 'An account with this email already exists' }),
    );

    const err = await client.post('/auth/register', { email: 'a@b.com' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('An account with this email already exists');
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('EMAIL_ALREADY_EXISTS');
  });

  // Bug guard: 200-with-garbage or proxy error pages crashing the parser
  it('handles non-JSON error body gracefully', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    await expect(client.get('/items')).rejects.toThrow('Request failed (502)');
  });

  it('falls back to status-based message when JSON has no error field', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'bad' }));

    await expect(client.post('/items', {})).rejects.toThrow('Request failed (400)');
  });

  // Bug guard: 204 No Content (e.g. DELETE /listings/:id/save) crashing json()
  it('returns undefined for 204 No Content responses', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(client.delete('/listings/abc/save')).resolves.toBeUndefined();
  });

  // Bug guard: 2xx with a garbage body previously escaped as a raw SyntaxError
  it('throws ApiError for a 200 response with a non-JSON body', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }));

    const err = await client.get('/items').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Malformed response body');
    expect((err as ApiError).status).toBe(200);
  });

  it('throws ApiError for a 200 response without the success envelope', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    await expect(client.get('/items')).rejects.toThrow('Malformed response body');
  });

  // Schema guard: a non-string error field can no longer become the ApiError message
  it('falls back to the generic message when the error field is not a string', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { ok: false, error: { detail: 'bad' } }));

    await expect(client.get('/items')).rejects.toThrow('Request failed (400)');
  });
});

describe('401 refresh flow', () => {
  // Bug guard: retry using the stale token → silent 401 loop
  it('retries with the NEW token after refresh, not the stale one', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { items: [] } }));

    await client.get('/items');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toBe('http://api.test/api/v1/auth/refresh');
    const retryHeaders = new Headers(mockFetch.mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
    expect(storage.setTokens).toHaveBeenCalledWith({
      accessToken: 'fresh',
      refreshToken: 'refresh-2',
    });
  });

  // Bug guard: failed refresh leaving the user stuck with dead tokens
  it('clears tokens and fires onAuthFailure when refresh returns non-ok', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Refresh token expired' }));

    await expect(client.get('/items')).rejects.toThrow('Token expired');

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });

  // New unified behavior: extension previously kept stale tokens on network errors
  it('clears tokens and fires onAuthFailure when refresh throws (network error)', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(client.get('/items')).rejects.toThrow('Token expired');

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });

  // Bug guard: refresh 200 with garbage data → TypeError crash or infinite loop
  it('treats malformed refresh response as failure and clears tokens', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: null }));

    await expect(client.get('/items')).rejects.toThrow();

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2); // original 401 + refresh, no loop
  });

  // Bug guard: unauthenticated 401 triggering a pointless refresh
  it('does not attempt refresh when no tokens are stored', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Auth required' }));

    await expect(client.get('/items')).rejects.toThrow('Auth required');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(storage.clearTokens).not.toHaveBeenCalled();
  });

  // Bug guard: 403 accidentally triggering refresh → wasted token rotation
  it('does not attempt refresh on 403 Forbidden', async () => {
    const storage = makeStorage({ accessToken: 'valid', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: 'Forbidden' }));

    await expect(client.get('/admin')).rejects.toThrow('Forbidden');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Bug guard: concurrent 401s each rotating the refresh token → race
  it('deduplicates concurrent refresh attempts', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    let refreshCallCount = 0;

    mockFetch.mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return jsonResponse(200, {
          ok: true,
          data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 },
        });
      }
      return jsonResponse(200, { ok: true, data: { items: [] } });
    });
    // First fetch of each concurrent request returns 401
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }));

    await Promise.all([client.get('/items'), client.get('/users')]);

    expect(refreshCallCount).toBe(1);
  });

  // Schema guard: refresh 200 with a valid envelope but invalid token payload
  it('treats a refresh payload failing schema validation as a failed refresh', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      // Valid success envelope, but payload lacks expiresIn → AuthTokenResponse rejects
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, data: { accessToken: 'fresh', refreshToken: 'refresh-2' } }),
      );

    await expect(client.get('/items')).rejects.toThrow('expired');

    expect(storage.setTokens).not.toHaveBeenCalled();
    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('revokes the refresh-token family on the server BEFORE clearing local tokens', async () => {
    // Bug this catches: clients that only clear local storage — the signed-out
    // device's refresh family stays live server-side for up to 30 days.
    const storage = makeStorage({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.logout();

    expect(mockFetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/logout');
    expect(JSON.parse(mockFetch.mock.calls[0][1]?.body as string)).toEqual({ refreshToken: 'ref-1' });
    expect(storage.clearTokens).toHaveBeenCalled();
    // Revoke must be attempted while the token is still readable
    expect(mockFetch.mock.invocationCallOrder[0]).toBeLessThan(
      storage.clearTokens.mock.invocationCallOrder[0],
    );
  });

  it('still clears local tokens when the revoke request fails (best-effort contract)', async () => {
    // Bug this catches: a network error during revoke leaving the user unable
    // to sign out locally.
    const storage = makeStorage({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(client.logout()).resolves.toBeUndefined();

    expect(storage.clearTokens).toHaveBeenCalled();
  });

  it('does not trigger the 401 refresh-retry machinery for the revoke call', async () => {
    // A 401 from logout (token already revoked/expired) must not mint a fresh
    // token pair for a user who is signing out.
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { ok: false, code: 'UNAUTHORIZED', error: 'x' }));

    await client.logout();

    expect(mockFetch).toHaveBeenCalledTimes(1); // no /auth/refresh, no retry
    expect(storage.clearTokens).toHaveBeenCalled();
  });

  it('skips the server call entirely when no tokens are stored', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });

    await client.logout();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(storage.clearTokens).toHaveBeenCalled();
  });
});
