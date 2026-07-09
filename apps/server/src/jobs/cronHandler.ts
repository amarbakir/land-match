import * as Sentry from '@sentry/node';
import type { Result } from '@landmatch/api';

import { runMigrations } from '../db/client';

// Stop processing this long before the Lambda deadline: enough to finish
// in-flight work, release claims, and flush Sentry instead of being killed
// mid-write.
const DEADLINE_BUFFER_MS = 15_000;

// Lambda stages have no other migration path (only the node-server entrypoint
// migrates at boot), so a fresh deploy would otherwise crash on new columns.
// Memoized per container; drizzle's migrator takes an advisory lock, so
// concurrent cold starts are safe. Reset on failure so the next invocation
// retries instead of caching the rejection.
let migrationsReady: Promise<void> | null = null;

export interface LambdaContext {
  getRemainingTimeInMillis?: () => number;
}

/**
 * Shared scaffold for sst.aws.Cron entrypoints: cold-start migrations,
 * deadline derivation, failure escalation (throw → CloudWatch errors metric),
 * and Sentry flush before the container freezes. The entrypoint file itself
 * must `import '../init'` first so Sentry initializes before other modules.
 */
export function createCronHandler<T>(
  name: string,
  run: (options: { deadlineAt?: number }) => Promise<Result<T>>,
) {
  return async function handler(_event: unknown, context?: LambdaContext): Promise<T> {
    try {
      try {
        await (migrationsReady ??= runMigrations());
      } catch (e) {
        migrationsReady = null;
        throw e;
      }

      const remainingMs = context?.getRemainingTimeInMillis?.();
      const deadlineAt = remainingMs !== undefined ? Date.now() + remainingMs - DEADLINE_BUFFER_MS : undefined;

      const result = await run({ deadlineAt });

      if (!result.ok) {
        // Throw so the invocation registers as a Lambda failure (CloudWatch errors metric)
        throw new Error(`${name} failed: ${result.error}`);
      }

      return result.data;
    } finally {
      // Lambda freezes the container as soon as the handler settles — flush
      // buffered Sentry events before that happens.
      await Sentry.flush(2000);
    }
  };
}
