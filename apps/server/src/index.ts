import { serve } from '@hono/node-server';

import { createApp } from './app';
import { server, validateConfig } from './config';
import { runMigrations } from './db/client';
import { startScheduler } from './jobs/scheduler';

function getTimestamp(): string {
  return new Date().toISOString();
}

process.on('unhandledRejection', (reason: unknown) => {
  console.error(`[${getTimestamp()}] [ERROR] [UNHANDLED_REJECTION]`, reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error(`[${getTimestamp()}] [ERROR] [UNCAUGHT_EXCEPTION]`, error);
  process.exit(1);
});

async function startServer() {
  validateConfig();
  await runMigrations();

  const app = createApp();
  serve({ fetch: app.fetch, port: server.port });
  console.log(`[${getTimestamp()}] [INFO] Hono server running on port ${server.port}`);
  startScheduler();
}

startServer().catch((error) => {
  console.error(`[${getTimestamp()}] [ERROR] [SERVER_START_FAILED]`, error);
  process.exit(1);
});
