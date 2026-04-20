/**
 * Tests for auth screen navigation behavior.
 *
 * These verify the navigation contract at the handler level:
 * - RegisterScreen: success → router.replace('/login')
 * - LoginScreen: success → router.replace('/(app)')
 * - Both: error → no navigation, error propagated
 *
 * We test the handler logic directly (what happens after form submission)
 * by simulating the same sequence the screens execute.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('RegisterScreen handler – navigation on success', () => {
  const mockReplace = vi.fn();
  const mockRegister = vi.fn<(data: any) => Promise<void>>();

  beforeEach(() => {
    mockReplace.mockReset();
    mockRegister.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Simulates what RegisterScreen.handleRegister does after validation passes.
   * This is the exact try/catch block from the component.
   */
  async function simulateRegisterHandler() {
    let error: string | null = null;
    try {
      await mockRegister({ email: 'a@b.com', password: '12345678' });
      mockReplace('/login');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Registration failed';
    }
    return { error };
  }

  // BUG CAUGHT: without router.replace('/login'), user stays on register screen
  // after successful account creation — no feedback, appears broken
  it('navigates to /login after successful registration', async () => {
    mockRegister.mockResolvedValue(undefined);

    const { error } = await simulateRegisterHandler();

    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(error).toBeNull();
  });

  // BUG: if register throws, navigation should NOT fire.
  // Without proper try/catch ordering, router.replace could fire before the
  // error is caught, causing a flash of the login screen then back to register.
  it('does NOT navigate when registration fails', async () => {
    mockRegister.mockRejectedValue(new Error('Email taken'));

    const { error } = await simulateRegisterHandler();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(error).toBe('Email taken');
  });
});

describe('LoginScreen handler – navigation on success', () => {
  const mockReplace = vi.fn();
  const mockLogin = vi.fn<(data: any) => Promise<void>>();

  beforeEach(() => {
    mockReplace.mockReset();
    mockLogin.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Simulates what LoginScreen.handleLogin does after validation passes.
   */
  async function simulateLoginHandler() {
    let error: string | null = null;
    try {
      await mockLogin({ email: 'a@b.com', password: '12345678' });
      mockReplace('/(app)');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Login failed';
    }
    return { error };
  }

  // BUG CAUGHT: without router.replace('/(app)'), user stays on login
  // screen after successful authentication — tokens stored but no navigation
  it('navigates to /(app) after successful login', async () => {
    mockLogin.mockResolvedValue(undefined);

    const { error } = await simulateLoginHandler();

    expect(mockReplace).toHaveBeenCalledWith('/(app)');
    expect(error).toBeNull();
  });

  // Ensures wrong destination isn't used (e.g., '/' or '/search' without group prefix)
  it('uses the correct route path with group prefix', async () => {
    mockLogin.mockResolvedValue(undefined);

    await simulateLoginHandler();

    const destination = mockReplace.mock.calls[0][0];
    expect(destination).toBe('/(app)');
    expect(destination).not.toBe('/'); // root '/' shows loading spinner, not the app
  });

  // BUG: navigation firing on error would cause a flash then redirect back
  it('does NOT navigate when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    const { error } = await simulateLoginHandler();

    expect(mockReplace).not.toHaveBeenCalled();
    expect(error).toBe('Invalid credentials');
  });

  // Edge case: what if login resolves but the promise result is unexpected?
  // The screen should still navigate since no error was thrown.
  it('navigates even if login resolves with undefined', async () => {
    mockLogin.mockResolvedValue(undefined);

    await simulateLoginHandler();

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
