import { describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/node';

import { createApp } from '../app';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  getCurrentScope: () => ({ setTag: vi.fn() }),
}));

// Force an unhandled (non-HTTPException) error from a route to exercise onError's
// capture branch. Malformed JSON is now caught at the parse site as a 400
// (readJson), so we make the service itself throw unexpectedly.
vi.mock('../services/authService', () => ({
  login: vi.fn(async () => {
    throw new Error('unexpected boom');
  }),
  register: vi.fn(),
  refresh: vi.fn(),
}));

describe('app Sentry capture', () => {
  it('captures unhandled route errors', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
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
