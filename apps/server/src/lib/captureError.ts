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
