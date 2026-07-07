import { describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/node';

import { createApp } from '../app';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  getCurrentScope: () => ({ setTag: vi.fn() }),
}));

describe('app Sentry capture', () => {
  it('captures unhandled route errors', async () => {
    const app = createApp();
    // malformed JSON body makes c.req.json() throw → onError non-HTTPException branch
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json',
    });

    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('does not capture expected HTTPExceptions', async () => {
    vi.mocked(Sentry.captureException).mockClear();
    const app = createApp();
    const res = await app.request('/api/v1/users/me'); // no auth → 401 HTTPException

    expect(res.status).toBe(401);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
