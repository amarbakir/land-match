import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { server } from './config';
import { pool } from './db/client';
import { generateRequestId } from './middleware/logging';
import type { Env } from './types/env';

export function createApp() {
  const app = new Hono<Env>();

  // CORS
  app.use('*', cors({ origin: server.corsOrigin }));

  // Request ID + timing
  app.use('*', async (c, next) => {
    const requestId = generateRequestId(c.req.header('x-request-id'));
    c.set('requestId', requestId);
    c.set('startTime', Date.now());
    await next();
  });

  // Error handler
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    const statusCode = 500 as ContentfulStatusCode;
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
    return c.json({ ok: false, code: 'INTERNAL_ERROR', error: err.message || 'Internal server error' }, statusCode);
  });

  // Health check (liveness)
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Readiness check (probes DB)
  app.get('/health/ready', async (c) => {
    const TIMEOUT = 3_000;
    const withTimeout = <T>(p: Promise<T>) =>
      Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))]);

    const [dbResult] = await Promise.allSettled([withTimeout(pool.query('SELECT 1'))]);

    const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
    const allOk = db === 'ok';

    return c.json({ status: allOk ? 'ok' : 'error', components: { db } }, allOk ? 200 : 503);
  });

  // Mount API routes here:
  // app.route('/api/v1/example', exampleRouter);

  return app;
}

export type App = ReturnType<typeof createApp>;
