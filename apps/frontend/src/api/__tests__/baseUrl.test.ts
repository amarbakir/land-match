import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveApiBaseUrl } from '../baseUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveApiBaseUrl', () => {
  it('falls back to localhost in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');

    expect(resolveApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('uses the EXPO_PUBLIC_API_BASE_URL override', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'http://192.168.1.5:3000');

    expect(resolveApiBaseUrl()).toBe('http://192.168.1.5:3000');
  });

  // Bug this catches: a production bundle silently built with the localhost
  // fallback (or a plaintext URL) ships credentials over cleartext http and
  // points a deployed frontend at nothing.
  it('refuses a non-https base URL in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'http://api.landmatch.example');

    expect(() => resolveApiBaseUrl()).toThrow(/https/);
  });

  it('refuses the missing-env localhost fallback in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');

    expect(() => resolveApiBaseUrl()).toThrow(/https/);
  });

  it('accepts an https URL in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.landmatch.example');

    expect(resolveApiBaseUrl()).toBe('https://api.landmatch.example');
  });
});
