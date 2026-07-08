import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as Sentry from '@sentry/node';

import type { ApiErrorEnvelopeType } from '@landmatch/api';
import { server } from './config';
import { pool } from './db/client';
import { registerEnrichmentMetrics } from './lib/enrichmentMetrics';
import { registerGeodataAdapters } from './lib/geodataAdapters';
import { logger } from './lib/logger';
import { requestLogging } from './middleware/requestLogging';
import { requireAuth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { InMemoryRateLimitStore } from './lib/rateLimitStore';
import { PostgresRateLimitStore } from './lib/postgresRateLimitStore';
import authRouter from './routes/auth';
import listingsRouter from './routes/listings';
import searchProfilesRouter from './routes/searchProfiles';
import matchesRouter from './routes/matches';
import scoresRouter from './routes/scores';
import usersRouter from './routes/users';
import type { Env } from './types/env';

export function createApp() {
  registerGeodataAdapters();
  registerEnrichmentMetrics();

  const app = new Hono<Env>();

  // Security headers (nosniff, HSTS, frame/referrer policy) on every response
  app.use('*', secureHeaders());

  // CORS
  app.use('*', cors({ origin: server.corsOrigin }));

  // Request ID + child logger + access log
  app.use('*', requestLogging(logger));

  // Error handler
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    const statusCode = 500 as ContentfulStatusCode;
    Sentry.captureException(err);
    (c.get('logger') ?? logger).error({ err }, `unhandled error: ${c.req.method} ${c.req.path}`);
    const body = { ok: false, code: 'INTERNAL_ERROR', error: err.message || 'Internal server error' } satisfies ApiErrorEnvelopeType;
    return c.json(body, statusCode);
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

  // Rate limits: strict on credential endpoints, looser on enrichment
  // (which fans out to external APIs and must not be hammered)
  const rateLimitStore = server.rateLimitStore === 'postgres'
    ? new PostgresRateLimitStore()
    : new InMemoryRateLimitStore();
  const { trustProxy } = server;
  app.use('/api/v1/auth/*', rateLimit({ windowMs: 60_000, max: 10, scope: 'auth', store: rateLimitStore, trustProxy }));
  app.use('/api/v1/listings/enrich', rateLimit({ windowMs: 60_000, max: 20, scope: 'enrich', store: rateLimitStore, trustProxy }));

  // Mount API routes
  app.route('/api/v1/auth', authRouter);
  app.use('/api/v1/listings/*', requireAuth);
  app.route('/api/v1/listings', listingsRouter);
  app.use('/api/v1/search-profiles/*', requireAuth);
  app.route('/api/v1/search-profiles', searchProfilesRouter);
  app.route('/api/v1/search-profiles', matchesRouter);
  app.use('/api/v1/scores/*', requireAuth);
  app.route('/api/v1/scores', scoresRouter);
  app.use('/api/v1/users/*', requireAuth);
  app.route('/api/v1/users', usersRouter);

  return app;
}

export type App = ReturnType<typeof createApp>;
