import * as Sentry from '@sentry/node';

import { logger } from './logger';

/**
 * Service catch blocks swallow failures into err('INTERNAL_ERROR') Results,
 * so thrown errors never reach the app-level Sentry handlers. Call this
 * instead of logger.error so operational failures hit both pino and Sentry.
 */
export function captureError(error: unknown, context: string): void {
  logger.error({ err: error }, context);
  Sentry.captureException(error, { tags: { context } });
}

/**
 * Await a side-path task, reporting (never propagating) its failure — for
 * work whose failure must not affect the main flow: token cleanup, budget
 * refunds, background matching, sweep DELETEs.
 */
export async function runBestEffort(context: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    captureError(error, context);
  }
}
