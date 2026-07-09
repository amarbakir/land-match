import type { EnrichmentResult } from './types';

export type EnrichmentStatus = 'enriched' | 'partial' | 'failed';

// 'enriched' means every adapter that ran succeeded — not merely that the
// pipeline completed. Rows left 'partial'/'failed' are picked up by the
// re-enrichment job.
export function deriveEnrichmentStatus(
  result: Pick<EnrichmentResult, 'sourcesUsed' | 'errors'>,
): EnrichmentStatus {
  if (result.sourcesUsed.length === 0) return 'failed';
  return result.errors.length > 0 ? 'partial' : 'enriched';
}
