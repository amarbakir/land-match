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
});
