import cron from 'node-cron';

import { email } from '../config';
import { deliverPendingAlerts } from '../services/alertDeliveryService';
import { logger } from '../lib/logger';

let deliveryJobRunning = false;

export function startScheduler(): void {
  // Email delivery cron — always starts, no-ops if no pending alerts
  logger.info({ schedule: email.deliveryCronSchedule }, 'starting email delivery cron');

  cron.schedule(email.deliveryCronSchedule, async () => {
    if (deliveryJobRunning) {
      logger.info('skipping delivery — previous run still in progress');
      return;
    }

    deliveryJobRunning = true;
    const startTime = Date.now();

    try {
      const result = await deliverPendingAlerts();

      if (!result.ok) {
        logger.error({ durationMs: Date.now() - startTime, err: result.error }, 'email delivery failed');
        return;
      }

      if (result.data.emailsSent > 0 || result.data.errors.length > 0) {
        logger.info({ durationMs: Date.now() - startTime, emails: result.data.emailsSent, alerts: result.data.alertsProcessed, errors: result.data.errors.length }, 'email delivery complete');
      }

      if (result.data.errors.length > 0) {
        logger.warn({ errors: result.data.errors.slice(0, 10) }, 'delivery errors');
      }
    } catch (error) {
      logger.error({ err: error }, 'email delivery failed');
    } finally {
      deliveryJobRunning = false;
    }
  });
}
