import type { Result } from '@landmatch/api';

import { logger } from '../lib/logger';

/**
 * Shared timing/log contract for background jobs, so local (node-cron) and
 * deployed (Lambda cron) runs emit identical, searchable log lines. Each
 * entrypoint keeps only its environment-specific escalation (Sentry.flush +
 * throw on Lambda, swallow-and-wait on node-cron).
 */
export async function runJob<T extends { errors: string[] }>(
  name: string,
  fn: () => Promise<Result<T>>,
  summarize: (data: T) => Record<string, unknown>,
): Promise<Result<T>> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;

  if (!result.ok) {
    logger.error({ durationMs, err: result.error }, `${name} failed`);
    return result;
  }

  if (result.data.errors.length > 0) {
    logger.warn({ errors: result.data.errors.slice(0, 10) }, `${name} errors`);
  }

  logger.info(
    { durationMs, ...summarize(result.data), errors: result.data.errors.length },
    `${name} complete`,
  );
  return result;
}
