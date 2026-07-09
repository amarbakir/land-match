// AWS Lambda entrypoint for scheduled alert delivery (sst.aws.Cron) — the
// deployed counterpart of the local node-cron scheduler, which never runs on
// Lambda stages.
// sort-imports-ignore — ../init must be imported first so Sentry initializes before other modules load
import '../init';

import * as Sentry from '@sentry/node';

import { runDelivery } from './runDelivery';

export async function handler() {
  try {
    const result = await runDelivery();

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
