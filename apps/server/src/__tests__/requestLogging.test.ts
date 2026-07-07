import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../lib/logger';
import { requestLogging, generateRequestId } from '../middleware/requestLogging';
import type { Env } from '../types/env';

const childLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const rootLogger = {
  child: vi.fn(() => childLogger),
} as unknown as Logger;

function buildApp() {
  const app = new Hono<Env>();
  app.use('*', requestLogging(rootLogger));
  app.get('/ok', (c) => c.json({ requestId: c.get('requestId') }));
  app.get('/missing', (c) => c.json({ ok: false }, 404));
  app.get('/boom', (c) => c.json({ ok: false }, 500));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateRequestId', () => {
  it('returns the existing id when provided', () => {
    expect(generateRequestId('abc')).toBe('abc');
  });

  it('generates a uuid when missing', () => {
    expect(generateRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('requestLogging', () => {
  it('creates a child logger bound to the request id and logs the request', async () => {
    const app = buildApp();
    const res = await app.request('/ok', { headers: { 'x-request-id': 'req-1' } });

    expect(res.status).toBe(200);
    expect(rootLogger.child).toHaveBeenCalledWith({ requestId: 'req-1' });
    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/ok',
        status: 200,
        durationMs: expect.any(Number),
      }),
      'request completed',
    );
  });

  it('exposes requestId to handlers via context', async () => {
    const app = buildApp();
    const res = await app.request('/ok', { headers: { 'x-request-id': 'req-2' } });
    expect(await res.json()).toEqual({ requestId: 'req-2' });
  });

  it('logs 4xx at warn and 5xx at error', async () => {
    const app = buildApp();

    await app.request('/missing');
    expect(childLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      'request completed',
    );

    await app.request('/boom');
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      'request completed',
    );
  });

  it('does not log health check requests', async () => {
    const app = buildApp();
    await app.request('/health');

    expect(childLogger.info).not.toHaveBeenCalled();
    expect(childLogger.warn).not.toHaveBeenCalled();
    expect(childLogger.error).not.toHaveBeenCalled();
  });
});
