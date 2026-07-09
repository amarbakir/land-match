import type { ListingEnrichmentStatus } from '@landmatch/api';

import type { EnrichmentResult } from './types';

// The outcome subset of the listing lifecycle — 'pending' means no run
// happened, so a run can never produce it.
export type EnrichmentStatus = Exclude<ListingEnrichmentStatus, 'pending'>;

// 'enriched' means every adapter that ran succeeded — not merely that the
// pipeline completed. Rows left 'partial'/'failed' are picked up by the
// re-enrichment job.
export function deriveEnrichmentStatus(
  result: Pick<EnrichmentResult, 'sourcesUsed' | 'errors'>,
): EnrichmentStatus {
  if (result.sourcesUsed.length === 0) return 'failed';
  return result.errors.length > 0 ? 'partial' : 'enriched';
}
