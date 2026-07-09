import cron from 'node-cron';
import * as Sentry from '@sentry/node';

import { email } from '../config';
import { runDelivery } from './runDelivery';
import { logger } from '../lib/logger';

// Claiming makes overlapping runs safe (alertRepo.claimPending), but skipping
// while a slow run is still in flight avoids pointless claim/release churn.
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
    try {
      await runDelivery();
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ err: error }, 'email delivery failed');
    } finally {
      deliveryJobRunning = false;
    }
  });
}
