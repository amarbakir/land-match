import type { Result } from '@landmatch/api';

import { deliverPendingAlerts, type DeliveryResult } from '../services/alertDeliveryService';
import { logger } from '../lib/logger';

/**
 * One delivery pass with the shared timing/log contract, so local (node-cron)
 * and deployed (Lambda cron) runs emit identical, searchable log lines. Each
 * entrypoint keeps only its environment-specific escalation (Sentry.flush +
 * throw on Lambda, swallow-and-wait on node-cron).
 */
export async function runDelivery(): Promise<Result<DeliveryResult>> {
  const startTime = Date.now();
  const result = await deliverPendingAlerts();
  const durationMs = Date.now() - startTime;

  if (!result.ok) {
    logger.error({ durationMs, err: result.error }, 'alert delivery failed');
    return result;
  }

  if (result.data.errors.length > 0) {
    logger.warn({ errors: result.data.errors.slice(0, 10) }, 'delivery errors');
  }

  logger.info(
    { durationMs, emails: result.data.emailsSent, alerts: result.data.alertsProcessed, errors: result.data.errors.length },
    'alert delivery complete',
  );
  return result;
}
