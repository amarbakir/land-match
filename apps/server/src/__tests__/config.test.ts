import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// config.ts resolves values at import time, so each test re-imports it
// with stubbed env vars. Stubbing to '' (rather than deleting) prevents
// dotenv from re-populating the key from a local .env file.
async function importConfig() {
  vi.resetModules();
  return import('../config');
}

describe('auth config — JWT secret', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/landmatch');
    vi.stubEnv('CORS_ORIGIN', 'https://app.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws in production when JWT_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');

    await expect(importConfig()).rejects.toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is the dev default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production');

    await expect(importConfig()).rejects.toThrow(/JWT_SECRET/);
  });

  it('uses the provided JWT_SECRET in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-real-production-secret');

    const config = await importConfig();
    expect(config.auth.jwtSecret).toBe('a-real-production-secret');
  });

  it('falls back to the dev default outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');

    const config = await importConfig();
    expect(config.auth.jwtSecret).toBe('dev-jwt-secret-change-in-production');
  });
});
