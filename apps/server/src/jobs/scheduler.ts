import cron from 'node-cron';
import * as Sentry from '@sentry/node';

import { email, reEnrichment } from '../config';
import { runDelivery } from './runDelivery';
import { runReEnrichment } from './runReEnrichment';
import { logger } from '../lib/logger';

// Overlapping runs are safe (alert claims / enrichment attempt caps), but
// skipping while a slow run is still in flight avoids pointless churn.
function scheduleJob(schedule: string, name: string, run: () => Promise<unknown>): void {
  let running = false;
  logger.info({ schedule }, `starting ${name} cron`);

  cron.schedule(schedule, async () => {
    if (running) {
      logger.info(`skipping ${name} — previous run still in progress`);
      return;
    }

    running = true;
    try {
      await run();
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ err: error }, `${name} failed`);
    } finally {
      running = false;
    }
  });
}

export function startScheduler(): void {
  if (email.inProcessCron) {
    scheduleJob(email.deliveryCronSchedule, 'email delivery', runDelivery);
  } else {
    logger.info('in-process email cron disabled — alert delivery runs via the AlertDelivery cron');
  }

  if (reEnrichment.inProcessCron) {
    scheduleJob(reEnrichment.cronSchedule, 're-enrichment', runReEnrichment);
  } else {
    logger.info('in-process re-enrichment cron disabled — re-enrichment runs via the ReEnrichment cron');
  }
}
