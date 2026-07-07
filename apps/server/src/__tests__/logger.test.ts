import { describe, expect, it } from 'vitest';

import { logger, resolveLogLevel } from '../lib/logger';

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
  it('is silent when running under vitest (NODE_ENV=test)', () => {
    expect(logger.level).toBe('silent');
  });
});
