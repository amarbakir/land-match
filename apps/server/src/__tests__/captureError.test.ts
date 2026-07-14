import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/node';

import { captureError, runBestEffort } from '../lib/captureError';
import { logger } from '../lib/logger';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('captureError', () => {
  it('reports the error to Sentry tagged with the service context', () => {
    const error = new Error('connection refused');

    captureError(error, 'userService.getNotificationPrefs');

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { context: 'userService.getNotificationPrefs' },
    });
  });

  it('logs the error with the context as message', () => {
    const spy = vi.spyOn(logger, 'error');
    const error = new Error('boom');

    captureError(error, 'matchService.getMatches');

    expect(spy).toHaveBeenCalledWith({ err: error }, 'matchService.getMatches');
  });
});

describe('runBestEffort', () => {
  it('swallows a rejection and reports it with the given context', async () => {
    // Bug this catches: a side-path failure (token cleanup, budget refund)
    // propagating into and failing the main request flow.
    const error = new Error('store down');

    await expect(
      runBestEffort('summaryBudget: refund failed', () => Promise.reject(error)),
    ).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { context: 'summaryBudget: refund failed' },
    });
  });

  it('runs the task to completion and reports nothing on success', async () => {
    let ran = false;

    await runBestEffort('ctx', async () => {
      ran = true;
    });

    expect(ran).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
