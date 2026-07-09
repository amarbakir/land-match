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
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@db.example.com:5432/landmatch');
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
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@db.example.com:5432/landmatch');
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

describe('database config — TLS', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CORS_ORIGIN', 'https://app.example.com');
    vi.stubEnv('JWT_SECRET', 'a-real-production-secret');
    vi.stubEnv('DATABASE_SSL_CA', '');
    vi.stubEnv('DIRECT_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubUrl(url: string) {
    vi.stubEnv('DATABASE_URL', url);
  }

  it('keeps local development plaintext — localhost URL gets no ssl config', async () => {
    // Bug this catches: forcing TLS on the default localhost URL would break
    // every local dev setup (docker-compose Postgres has no certs).
    stubUrl('postgresql://postgres:postgres@localhost:5432/landmatch');

    const config = await importConfig();
    expect(config.database.connection.ssl).toBeUndefined();
  });

  it('defaults any remote host to certificate-verified TLS', async () => {
    stubUrl('postgresql://user:pass@db.abc.supabase.co:5432/landmatch');

    const config = await importConfig();
    // Bug this catches: the old host.includes('supabase.co') heuristic set
    // rejectUnauthorized: false — encrypted but MITM-able — and left every
    // non-Supabase remote host with no TLS at all.
    expect(config.database.connection.ssl).toEqual({ rejectUnauthorized: true, ca: undefined });
  });

  it('honors sslmode=disable for a non-local dev database', async () => {
    stubUrl('postgresql://user:pass@192.168.1.50:5432/landmatch?sslmode=disable');

    const config = await importConfig();
    expect(config.database.connection.ssl).toBeUndefined();
  });

  it('honors sslmode=no-verify as an explicit unverified-TLS escape hatch', async () => {
    stubUrl('postgresql://user:pass@db.abc.supabase.co:5432/landmatch?sslmode=no-verify');

    const config = await importConfig();
    expect(config.database.connection.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('passes an inline PEM from DATABASE_SSL_CA to the connection', async () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
    stubUrl('postgresql://user:pass@db.abc.supabase.co:5432/landmatch');
    vi.stubEnv('DATABASE_SSL_CA', pem);

    const config = await importConfig();
    expect(config.database.connection.ssl).toEqual({ rejectUnauthorized: true, ca: pem });
  });

  it('refuses to start in production without verified TLS (sslmode=disable)', async () => {
    // Bug this catches: production DB traffic (credentials, password hashes,
    // PII) running plaintext because someone copied a dev URL.
    vi.stubEnv('NODE_ENV', 'production');
    stubUrl('postgresql://user:pass@db.example.com:5432/landmatch?sslmode=disable');

    await expect(importConfig()).rejects.toThrow(/certificate-verified TLS/);
  });

  it('refuses to start in production with unverified TLS (sslmode=no-verify)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubUrl('postgresql://user:pass@db.example.com:5432/landmatch?sslmode=no-verify');

    await expect(importConfig()).rejects.toThrow(/certificate-verified TLS/);
  });

  it('refuses to start in production when DIRECT_URL is unverified even if DATABASE_URL is fine', async () => {
    // Bug this catches: migrations (DIRECT_URL) silently running plaintext
    // while the app pool is verified.
    vi.stubEnv('NODE_ENV', 'production');
    stubUrl('postgresql://user:pass@db.example.com:5432/landmatch');
    vi.stubEnv('DIRECT_URL', 'postgresql://user:pass@db.example.com:5432/landmatch?sslmode=disable');

    await expect(importConfig()).rejects.toThrow(/DIRECT_URL/);
  });
});
