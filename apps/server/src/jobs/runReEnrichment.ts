import type { Result } from '@landmatch/api';

import { reEnrichPendingListings, type ReEnrichmentOptions, type ReEnrichmentResult } from '../services/reEnrichmentService';
import { logger } from '../lib/logger';

/**
 * One re-enrichment pass with the shared timing/log contract, so local
 * (node-cron) and deployed (Lambda cron) runs emit identical, searchable log
 * lines — same pattern as runDelivery.
 */
export async function runReEnrichment(options: ReEnrichmentOptions = {}): Promise<Result<ReEnrichmentResult>> {
  const startTime = Date.now();
  const result = await reEnrichPendingListings(options);
  const durationMs = Date.now() - startTime;

  if (!result.ok) {
    logger.error({ durationMs, err: result.error }, 're-enrichment failed');
    return result;
  }

  if (result.data.errors.length > 0) {
    logger.warn({ errors: result.data.errors.slice(0, 10) }, 're-enrichment errors');
  }

  logger.info(
    {
      durationMs,
      processed: result.data.processed,
      enriched: result.data.enriched,
      partial: result.data.partial,
      failed: result.data.failed,
      errors: result.data.errors.length,
    },
    're-enrichment complete',
  );
  return result;
}
