import { serve } from '@hono/node-server';

import { createApp } from './app';
import { server, validateConfig } from './config';
import { runMigrations } from './db/client';
import { startScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'unhandled rejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});

async function startServer() {
  validateConfig();
  await runMigrations();

  const app = createApp();
  serve({ fetch: app.fetch, port: server.port });
  logger.info({ port: server.port }, 'Hono server running');
  startScheduler();
}

startServer().catch((error) => {
  logger.fatal({ err: error }, 'server start failed');
  process.exit(1);
});
