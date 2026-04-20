import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock tokenStorage before importing client
vi.mock('../../auth/tokenStorage', () => ({
  getTokens: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

import { getTokens, setTokens, clearTokens } from '../../auth/tokenStorage';
import { apiGet, apiPost, setOnAuthFailure } from '../client';

const mockGetTokens = vi.mocked(getTokens);
const mockSetTokens = vi.mocked(setTokens);
const mockClearTokens = vi.mocked(clearTokens);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API client auth flow', () => {
  const mockFetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    mockFetch.mockReset();
    mockGetTokens.mockReset();
    mockSetTokens.mockReset();
    mockClearTokens.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    mockGetTokens.mockResolvedValue(null);
    mockSetTokens.mockResolvedValue();
    mockClearTokens.mockResolvedValue();
    setOnAuthFailure(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Bug: retry uses stale token instead of refreshed one → silent 401 loop
  it('retries with the NEW token after refresh, not the stale one', async () => {
    mockGetTokens
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' }) // initial request
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' }) // tryRefresh reads tokens
      .mockResolvedValueOnce({ accessToken: 'fresh', refreshToken: 'refresh-2' }); // retry reads new tokens

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Token expired' })) // original
      .mockResolvedValueOnce(jsonResponse(200, { data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 } })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { data: { items: [] } })); // retry

    await apiGet('/api/v1/items');

    // The retry (3rd fetch call) must use 'fresh', not 'expired'
    const retryCall = mockFetch.mock.calls[2];
    const retryHeaders = new Headers(retryCall[1]?.headers as HeadersInit);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
  });

  // Bug: failed refresh leaves user stuck — tokens remain, no redirect to login
  it('clears tokens and fires onAuthFailure when refresh fails', async () => {
    const authFailure = vi.fn();
    setOnAuthFailure(authFailure);

    mockGetTokens
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' })
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Refresh token expired' })); // refresh itself fails

    // apiGet throws because the final response is 401
    await expect(apiGet('/api/v1/items')).rejects.toThrow();

    expect(mockClearTokens).toHaveBeenCalled();
    expect(authFailure).toHaveBeenCalled();
  });

  // Bug: 403 accidentally triggers refresh → wastes refresh token, confusing UX
  it('does not attempt refresh on 403 Forbidden', async () => {
    mockGetTokens.mockResolvedValue({ accessToken: 'valid', refreshToken: 'refresh-1' });
    mockFetch.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));

    await expect(apiGet('/api/v1/admin')).rejects.toThrow('Forbidden');

    // Only 1 fetch call — no refresh attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Bug: unauthenticated 401 triggers refresh with null token → crash or wasted request
  it('does not attempt refresh when no tokens are stored', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: 'Auth required' }));

    await expect(apiGet('/api/v1/items')).rejects.toThrow('Auth required');

    // Only 1 fetch — no refresh, no clearTokens (nothing to clear)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  // Bug: noAuth requests accidentally include Bearer header → leaks token to public endpoints
  it('noAuth requests do not include Authorization header', async () => {
    mockGetTokens.mockResolvedValue({ accessToken: 'secret', refreshToken: 'refresh-1' });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    await apiPost('/api/v1/auth/login', { email: 'a@b.com', password: 'pw' }, { noAuth: true });

    const callHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders).not.toHaveProperty('Authorization');
  });

  // Bug: concurrent 401s each trigger a refresh → race condition, double token rotation
  it('deduplicates concurrent refresh attempts', async () => {
    let refreshCallCount = 0;

    mockGetTokens
      .mockResolvedValue({ accessToken: 'expired', refreshToken: 'refresh-1' });

    mockFetch.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return jsonResponse(200, { data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 } });
      }
      // First call for each returns 401, subsequent calls succeed
      return jsonResponse(200, { data: { items: [] } });
    });

    // Override: first two fetches return 401
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }));

    // Fire two requests concurrently that both get 401
    await Promise.all([
      apiGet('/api/v1/items'),
      apiGet('/api/v1/users'),
    ]);

    // Only ONE refresh call, not two
    expect(refreshCallCount).toBe(1);
  });

  // Bug: server returns 200 with non-JSON body → unhandled parse error crashes app
  it('handles non-JSON error body gracefully', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce(
      new Response('Bad Gateway', { status: 502 }),
    );

    await expect(apiGet('/api/v1/items')).rejects.toThrow('Request failed (502)');
  });

  // Bug: server returns JSON error without 'error' field → generic message shown
  it('falls back to status-based message when JSON has no error field', async () => {
    mockGetTokens.mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'bad' }));

    await expect(apiPost('/api/v1/items', {})).rejects.toThrow('Request failed (400)');
  });

  // Bug: refresh endpoint returns 200 but with garbage data → TypeError crashes app
  // tryRefresh catches this and treats it as a failed refresh
  it('treats malformed refresh response as failure and clears tokens', async () => {
    const authFailure = vi.fn();
    setOnAuthFailure(authFailure);

    mockGetTokens
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' })
      .mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'refresh-1' });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      // Refresh returns 200 but data is null → data.accessToken throws TypeError
      .mockResolvedValueOnce(jsonResponse(200, { data: null }));

    // tryRefresh catches the TypeError, returns false → clears tokens, fires onAuthFailure
    await expect(apiGet('/api/v1/items')).rejects.toThrow();

    expect(mockClearTokens).toHaveBeenCalled();
    expect(authFailure).toHaveBeenCalled();
    // Only 2 fetches: original 401 + refresh attempt. No infinite loop.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
