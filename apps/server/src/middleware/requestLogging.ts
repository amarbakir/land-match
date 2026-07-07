import { randomUUID } from 'crypto';
import type { MiddlewareHandler } from 'hono';

import type { Logger } from '../lib/logger';
import type { Env } from '../types/env';

export function generateRequestId(existing?: string | null): string {
  return existing || randomUUID();
}

/**
 * Sets requestId, startTime, and a request-scoped child logger on context,
 * then emits one access-log line per completed request.
 * Health checks are excluded from the access log.
 */
export function requestLogging(rootLogger: Logger): MiddlewareHandler<Env> {
  return async (c, next) => {
    const requestId = generateRequestId(c.req.header('x-request-id'));
    const requestLogger = rootLogger.child({ requestId });

    c.set('requestId', requestId);
    c.set('startTime', Date.now());
    c.set('logger', requestLogger);

    await next();

    if (c.req.path.startsWith('/health')) return;

    const status = c.res.status;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    requestLogger[level](
      {
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - c.get('startTime'),
        userId: c.get('userId'),
      },
      'request completed',
    );
  };
}
