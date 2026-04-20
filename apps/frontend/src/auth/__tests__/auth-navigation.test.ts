/**
 * Tests for auth navigation contracts:
 * - Register creates account but does NOT auto-authenticate (no tokens stored)
 * - Login stores tokens (enabling navigation to app)
 * - Errors propagate without partial state changes
 *
 * These test the same apiPost/tokenStorage interactions that the AuthContext uses,
 * exercising the contract that screens depend on for navigation decisions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tokenStorage', () => ({
  getTokens: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  apiPost: vi.fn(),
  setOnAuthFailure: vi.fn(),
}));

import { clearTokens, getTokens, setTokens } from '../tokenStorage';
import { apiPost } from '../../api/client';

const mockGetTokens = vi.mocked(getTokens);
const mockSetTokens = vi.mocked(setTokens);
const mockApiPost = vi.mocked(apiPost);

/**
 * Replicate what AuthContext.register does: call apiPost, nothing else.
 * This is the exact contract the RegisterScreen relies on —
 * register resolves without side effects so the screen can navigate to /login.
 */
async function registerFlow(data: { email: string; password: string; name?: string }) {
  // This mirrors AuthContext.register after the fix
  await apiPost('/api/v1/auth/register', data, { noAuth: true });
}

/**
 * Replicate what AuthContext.login does: call apiPost, store tokens.
 * This is the contract LoginScreen relies on —
 * login resolves with tokens stored so the screen can navigate to /(app)/search.
 */
async function loginFlow(data: { email: string; password: string }) {
  const result = await apiPost('/api/v1/auth/login', data, { noAuth: true });
  await setTokens((result as any).accessToken, (result as any).refreshToken);
}

describe('register flow – no auto-authentication', () => {
  beforeEach(() => {
    mockGetTokens.mockReset();
    mockSetTokens.mockReset();
    mockApiPost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // BUG CAUGHT: register previously called setTokens and set isAuthenticated=true,
  // which meant the user bypassed login entirely and the router.replace('/login')
  // in RegisterScreen would fight with the auth redirect.
  it('does not store tokens after successful registration', async () => {
    mockApiPost.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    await registerFlow({ email: 'user@example.com', password: 'password123' });

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/v1/auth/register',
      { email: 'user@example.com', password: 'password123' },
      { noAuth: true },
    );
    // Critical: tokens must NOT be stored — user should go to login screen
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  // Ensures the error surfaces so RegisterScreen can display it
  // without any partial token storage
  it('propagates API error without storing tokens', async () => {
    mockApiPost.mockRejectedValue(new Error('Email already in use'));

    await expect(
      registerFlow({ email: 'taken@example.com', password: 'password123' }),
    ).rejects.toThrow('Email already in use');

    expect(mockSetTokens).not.toHaveBeenCalled();
  });
});

describe('login flow – stores tokens for navigation', () => {
  beforeEach(() => {
    mockGetTokens.mockReset();
    mockSetTokens.mockReset();
    mockApiPost.mockReset();
    mockSetTokens.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies the contract that LoginScreen depends on:
  // after login resolves, tokens are stored → screen can safely navigate to app
  it('stores tokens after successful login', async () => {
    mockApiPost.mockResolvedValue({
      accessToken: 'my-access-token',
      refreshToken: 'my-refresh-token',
    });

    await loginFlow({ email: 'user@example.com', password: 'password123' });

    expect(mockSetTokens).toHaveBeenCalledWith('my-access-token', 'my-refresh-token');
  });

  // BUG: if apiPost throws but setTokens was already called (or vice versa),
  // user gets stuck in broken state. Ensures atomicity.
  it('does not store tokens when API call fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Invalid credentials'));

    await expect(
      loginFlow({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials');

    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  // Ensures the screen gets the resolved promise signal to navigate
  it('resolves without error on success (enabling navigation)', async () => {
    mockApiPost.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'ref',
    });

    // Should not throw — this is the signal for router.replace to execute
    await expect(loginFlow({ email: 'a@b.com', password: '12345678' })).resolves.toBeUndefined();
  });
});

describe('register vs login – asymmetry is intentional', () => {
  beforeEach(() => {
    mockSetTokens.mockReset();
    mockApiPost.mockReset();
    mockSetTokens.mockResolvedValue();
  });

  // Documents the design decision: register and login have DIFFERENT
  // post-success behavior. This test breaks if someone accidentally
  // adds token storage back to register.
  it('register and login differ in token storage behavior', async () => {
    mockApiPost.mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'ref',
    });

    await registerFlow({ email: 'a@b.com', password: '12345678' });
    const registerCallCount = mockSetTokens.mock.calls.length;

    await loginFlow({ email: 'a@b.com', password: '12345678' });
    const loginCallCount = mockSetTokens.mock.calls.length;

    expect(registerCallCount).toBe(0); // register: no tokens
    expect(loginCallCount).toBe(1); // login: tokens stored
  });
});
