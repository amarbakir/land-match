import { describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/node';

import { captureError } from '../lib/captureError';
import { logger } from '../lib/logger';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

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
