import type { Result } from '@landmatch/api';

import { deliverPendingAlerts, type DeliveryOptions, type DeliveryResult } from '../services/alertDeliveryService';
import { runJob } from './runJob';

/** One delivery pass with the shared timing/log contract (see runJob). */
export async function runDelivery(options: DeliveryOptions = {}): Promise<Result<DeliveryResult>> {
  return runJob('alert delivery', () => deliverPendingAlerts(options), (data) => ({
    emails: data.emailsSent,
    alerts: data.alertsProcessed,
  }));
}
