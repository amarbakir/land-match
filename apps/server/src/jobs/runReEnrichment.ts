import type { Result } from '@landmatch/api';

import { reEnrichPendingListings, type ReEnrichmentOptions, type ReEnrichmentResult } from '../services/reEnrichmentService';
import { runJob } from './runJob';

/** One re-enrichment pass with the shared timing/log contract (see runJob). */
export async function runReEnrichment(options: ReEnrichmentOptions = {}): Promise<Result<ReEnrichmentResult>> {
  return runJob('re-enrichment', () => reEnrichPendingListings(options), (data) => ({
    processed: data.processed,
    enriched: data.enriched,
    partial: data.partial,
    failed: data.failed,
  }));
}
