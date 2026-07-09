// AWS Lambda entrypoint for scheduled alert delivery (sst.aws.Cron) — the
// deployed counterpart of the local node-cron scheduler, which never runs on
// Lambda stages.
// sort-imports-ignore — ../init must be imported first so Sentry initializes before other modules load
import '../init';

import * as Sentry from '@sentry/node';

import { runMigrations } from '../db/client';
import { runDelivery } from './runDelivery';

// Lambda stages have no other migration path (only the node-server entrypoint
// migrates at boot), so a fresh deploy would otherwise crash on new columns.
// Memoized per container; drizzle's migrator takes an advisory lock, so
// concurrent cold starts are safe. Reset on failure so the next invocation
// retries instead of caching the rejection.
let migrationsReady: Promise<void> | null = null;

// Stop processing this long before the Lambda deadline: enough to release
// remaining claims and flush Sentry instead of being killed mid-send.
const DEADLINE_BUFFER_MS = 15_000;

interface LambdaContext {
  getRemainingTimeInMillis?: () => number;
}

export async function handler(_event: unknown, context?: LambdaContext) {
  try {
    try {
      await (migrationsReady ??= runMigrations());
    } catch (e) {
      migrationsReady = null;
      throw e;
    }

    const remainingMs = context?.getRemainingTimeInMillis?.();
    const deadlineAt = remainingMs !== undefined ? Date.now() + remainingMs - DEADLINE_BUFFER_MS : undefined;

    const result = await runDelivery({ deadlineAt });

    if (!result.ok) {
      // Throw so the invocation registers as a Lambda failure (CloudWatch errors metric)
      throw new Error(`alert delivery failed: ${result.error}`);
    }

    return result.data;
  } finally {
    // Lambda freezes the container as soon as the handler settles — flush
    // buffered Sentry events before that happens.
    await Sentry.flush(2000);
  }
}
