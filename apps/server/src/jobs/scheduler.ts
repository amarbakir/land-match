import cron from 'node-cron';

import { email } from '../config';
import { deliverPendingAlerts } from '../services/alertDeliveryService';

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
}
