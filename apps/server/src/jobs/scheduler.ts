import cron from 'node-cron';

import { feedPipeline, email } from '../config';
import { buildAdapters } from '../services/feedPipelineService';
import { runPipeline } from '../services/feedPipelineService';
import { deliverPendingAlerts } from '../services/alertDeliveryService';

let jobRunning = false;
let deliveryJobRunning = false;

export function startScheduler(): void {
  // Email delivery cron — always starts, no-ops if no pending alerts
  console.log(`[scheduler] Starting email delivery cron: ${email.deliveryCronSchedule}`);

  cron.schedule(email.deliveryCronSchedule, async () => {
    if (deliveryJobRunning) {
      console.log('[scheduler] Skipping delivery — previous run still in progress');
      return;
    }

    deliveryJobRunning = true;
    const startTime = Date.now();

    try {
      const result = await deliverPendingAlerts();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!result.ok) {
        console.error(`[scheduler] Email delivery failed in ${elapsed}s:`, result.error);
        return;
      }

      if (result.data.emailsSent > 0 || result.data.errors.length > 0) {
        console.log(
          `[scheduler] Email delivery complete in ${elapsed}s: ` +
          `emails=${result.data.emailsSent} alerts=${result.data.alertsProcessed} ` +
          `errors=${result.data.errors.length}`,
        );
      }

      if (result.data.errors.length > 0) {
        console.warn('[scheduler] Delivery errors:', result.data.errors.slice(0, 10));
      }
    } catch (error) {
      console.error('[scheduler] Email delivery failed:', error);
    } finally {
      deliveryJobRunning = false;
    }
  });

  // Feed pipeline cron — only starts if feed URLs are configured
  const adapters = buildAdapters();

  if (adapters.length === 0) {
    console.log('[scheduler] No feed URLs configured — feed pipeline disabled');
    return;
  }

  console.log(
    `[scheduler] Starting feed pipeline cron: ${feedPipeline.cronSchedule} (${adapters.map((a) => a.name).join(', ')})`,
  );

  cron.schedule(feedPipeline.cronSchedule, async () => {
    if (jobRunning) {
      console.log('[scheduler] Skipping — previous run still in progress');
      return;
    }

    jobRunning = true;
    const startTime = Date.now();

    try {
      console.log('[scheduler] Feed pipeline run starting');
      const result = await runPipeline(adapters);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(
        `[scheduler] Feed pipeline complete in ${elapsed}s: ` +
        `ingested=${result.ingested} enriched=${result.enriched} ` +
        `matched=${result.matched} alerts=${result.alertsCreated} ` +
        `errors=${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn('[scheduler] Errors:', result.errors.slice(0, 10));
      }
    } catch (error) {
      console.error('[scheduler] Feed pipeline failed:', error);
    } finally {
      jobRunning = false;
    }
  });
}
