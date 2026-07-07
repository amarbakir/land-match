import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/node';

vi.mock('@sentry/node', () => ({ init: vi.fn() }));

async function importFresh() {
  vi.resetModules();
  const config = await import('../config');
  const init = await import('../init');
  return { config, init };
}

describe('sentry config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('is unconfigured by default and spotlight is off', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_SPOTLIGHT', '');
    const { config } = await importFresh();

    expect(config.sentry.isConfigured).toBe(false);
    expect(config.sentry.spotlight).toBe(false);
    expect(config.sentry.tracesSampleRate).toBe(0.1);
  });

  it('parses SENTRY_SPOTLIGHT=1 and =true', async () => {
    vi.stubEnv('SENTRY_SPOTLIGHT', '1');
    expect((await importFresh()).config.sentry.spotlight).toBe(true);

    vi.stubEnv('SENTRY_SPOTLIGHT', 'true');
    expect((await importFresh()).config.sentry.spotlight).toBe(true);
  });

  it('environment falls back to NODE_ENV when SENTRY_ENVIRONMENT is unset', async () => {
    vi.stubEnv('SENTRY_ENVIRONMENT', '');
    const { config } = await importFresh();

    expect(config.sentry.environment).toBe('test');
  });

  it('is configured when SENTRY_DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@sentry.example/1');
    const { config } = await importFresh();

    expect(config.sentry.isConfigured).toBe(true);
  });
});

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not init when neither DSN nor spotlight is set', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_SPOTLIGHT', '');
    await importFresh();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('inits with spotlight enabled and no DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_SPOTLIGHT', '1');
    await importFresh();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: undefined, spotlight: true }),
    );
  });

  it('inits with the DSN when configured', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@sentry.example/1');
    vi.stubEnv('SENTRY_SPOTLIGHT', '');
    await importFresh();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@sentry.example/1' }),
    );
  });
});
