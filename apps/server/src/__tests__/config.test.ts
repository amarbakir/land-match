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

describe('server config — CORS origin', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/landmatch');
    vi.stubEnv('JWT_SECRET', 'a-real-production-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws in production when CORS_ORIGIN is the wildcard', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGIN', '*');

    await expect(importConfig()).rejects.toThrow(/CORS_ORIGIN/);
  });

  it('parses a comma-separated list into trimmed origins', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGIN', 'https://app.example.com, https://admin.example.com');

    const config = await importConfig();
    expect(config.server.corsOrigin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('returns a single origin as a string', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGIN', 'https://app.example.com');

    const config = await importConfig();
    expect(config.server.corsOrigin).toBe('https://app.example.com');
  });

  it('defaults to the wildcard outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORS_ORIGIN', '');

    const config = await importConfig();
    expect(config.server.corsOrigin).toBe('*');
  });
});
