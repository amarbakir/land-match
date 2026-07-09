// AWS Lambda entrypoint for scheduled alert delivery (sst.aws.Cron) — the
// deployed counterpart of the local node-cron scheduler, which never runs on
// Lambda stages.
// sort-imports-ignore — ../init must be imported first so Sentry initializes before other modules load
import '../init';

import * as Sentry from '@sentry/node';

import { deliverPendingAlerts } from '../services/alertDeliveryService';
import { logger } from '../lib/logger';

export async function handler() {
  const startTime = Date.now();

  try {
    const result = await deliverPendingAlerts();

    if (!result.ok) {
      logger.error({ durationMs: Date.now() - startTime, err: result.error }, 'alert delivery failed');
      // Throw so the invocation registers as a Lambda failure (CloudWatch errors metric)
      throw new Error(`alert delivery failed: ${result.error}`);
    }

    if (result.data.errors.length > 0) {
      logger.warn({ errors: result.data.errors.slice(0, 10) }, 'delivery errors');
    }

    logger.info(
      { durationMs: Date.now() - startTime, emails: result.data.emailsSent, alerts: result.data.alertsProcessed, errors: result.data.errors.length },
      'alert delivery complete',
    );
    return result.data;
  } finally {
    // Lambda freezes the container as soon as the handler settles — flush
    // buffered Sentry events before that happens.
    await Sentry.flush(2000);
  }
}
