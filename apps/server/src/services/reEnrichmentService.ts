import { err, ok, type Result } from '@landmatch/api';
import { deriveEnrichmentStatus, runEnrichmentPipeline } from '@landmatch/enrichment';

import { captureError } from '../lib/captureError';
import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { persistEnrichment } from './listingService';
import { matchListingAgainstProfiles } from './matchingService';

// Rows that hit the cap stop being selected — a listing that can never enrich
// (bad coords, unmapped area) must not burn vendor quota on every run.
// Mirrored in the listings_reenrich_idx partial-index predicate (schema.ts).
export const MAX_ENRICHMENT_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;
// Worst-case single listing: slowest adapter timeout (15s) + jittered sleep
// + full retry, plus persistence. Never start a listing that can't finish
// before the deadline — a hard-killed Lambda rolls back the attempt record,
// so the same slow listing would lead every subsequent run.
const PER_LISTING_BUDGET_MS = 35_000;

export interface ReEnrichmentOptions {
  /** Epoch ms — stop picking up new listings once passed (Lambda deadline). */
  deadlineAt?: number;
  batchSize?: number;
}

export interface ReEnrichmentResult {
  processed: number;
  enriched: number;
  partial: number;
  /** Runs that produced no data at all (attempt consumed, row untouched). */
  failed: number;
  errors: string[];
}

/**
 * One re-enrichment pass over listings whose enrichment is not complete
 * ('pending'/'partial'/'failed'). Each listing re-runs the vendor pipeline;
 * runs that produce data replace the enrichment row and refresh stale scores.
 */
export async function reEnrichPendingListings(
  options: ReEnrichmentOptions = {},
): Promise<Result<ReEnrichmentResult>> {
  const { deadlineAt, batchSize = DEFAULT_BATCH_SIZE } = options;

  try {
    const candidates = await listingRepo.findListingsNeedingEnrichment(batchSize, MAX_ENRICHMENT_ATTEMPTS);

    const result: ReEnrichmentResult = { processed: 0, enriched: 0, partial: 0, failed: 0, errors: [] };

    for (const listing of candidates) {
      if (deadlineAt !== undefined && Date.now() >= deadlineAt - PER_LISTING_BUDGET_MS) break;

      try {
        // Candidates are filtered on non-null coordinates
        const enrichment = await runEnrichmentPipeline({ lat: listing.latitude!, lng: listing.longitude! }, { retry: true });
        result.processed++;

        if (deriveEnrichmentStatus(enrichment) === 'failed') {
          // Nothing gained — keep the existing row/status, consume retry budget
          await listingRepo.recordEnrichmentAttempt(listing.id, undefined);
          result.failed++;
          continue;
        }

        // Status reflects the MERGED row, not just this run: a partial run
        // that completes coverage started by an earlier run is 'enriched' and
        // must leave the retry loop.
        const status = await db.transaction(async (tx) => {
          const { enrichmentRow } = await persistEnrichment(listing, enrichment, tx);
          const mergedSources = enrichmentRow?.sourcesUsed ?? enrichment.sourcesUsed;
          const unresolved = enrichment.errors.filter((e) => !mergedSources.includes(e.source));
          const merged = deriveEnrichmentStatus({ sourcesUsed: mergedSources, errors: unresolved });
          await listingRepo.recordEnrichmentAttempt(listing.id, merged, tx);
          return merged;
        });
        result[status === 'enriched' ? 'enriched' : 'partial']++;

        // Scores were computed against the old (possibly neutral) data
        const match = await matchListingAgainstProfiles(listing.id, { rescore: true });
        if (!match.ok) {
          result.errors.push(`rescore ${listing.id}: ${match.error}`);
        }
      } catch (e) {
        captureError(e, 'reEnrichmentService: listing re-enrichment failed');
        result.errors.push(`re-enrich ${listing.id}: ${e instanceof Error ? e.message : String(e)}`);
        // Still consume retry budget — a listing whose persist always throws
        // must not bypass the attempt cap and retry forever. Best effort: if
        // this write fails too, the next run simply retries the listing.
        await listingRepo.recordEnrichmentAttempt(listing.id, undefined).catch(() => {});
      }
    }

    return ok(result);
  } catch (error) {
    captureError(error, 'reEnrichmentService.reEnrichPendingListings');
    return err('INTERNAL_ERROR');
  }
}
