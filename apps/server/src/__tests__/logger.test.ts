import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLogLevel } from '../lib/logger';

describe('resolveLogLevel', () => {
  it('honors LOG_LEVEL over everything', () => {
    expect(resolveLogLevel('production', 'trace')).toBe('trace');
  });

  it('is silent under test', () => {
    expect(resolveLogLevel('test', undefined)).toBe('silent');
  });

  it('defaults to info in production', () => {
    expect(resolveLogLevel('production', undefined)).toBe('info');
  });

  it('defaults to debug in development', () => {
    expect(resolveLogLevel('development', undefined)).toBe('debug');
    expect(resolveLogLevel(undefined, undefined)).toBe('debug');
  });
});

describe('logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Re-import with LOG_LEVEL stubbed empty so a developer's local .env
  // (which resolveLogLevel deliberately honors) can't flip this test.
  it('wires resolveLogLevel into the pino instance (silent under NODE_ENV=test)', async () => {
    vi.stubEnv('LOG_LEVEL', '');
    vi.resetModules();

    const { logger: freshLogger } = await import('../lib/logger');
    expect(freshLogger.level).toBe('silent');
  });
});
