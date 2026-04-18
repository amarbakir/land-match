import { runFeedIngestion, type FeedAdapter } from '@landmatch/feeds';
import { enrichListing } from '@landmatch/enrichment';

import { feedPipeline } from '../config';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from './matchingService';

interface PipelineResult {
  ingested: number;
  enriched: number;
  enrichFailed: number;
  matched: number;
  alertsCreated: number;
  errors: string[];
}

export async function runPipeline(
  adapters: FeedAdapter[],
  enrichmentBatchSize: number = feedPipeline.enrichmentBatchSize,
): Promise<PipelineResult> {
  const result: PipelineResult = {
    ingested: 0,
    enriched: 0,
    enrichFailed: 0,
    matched: 0,
    alertsCreated: 0,
    errors: [],
  };

  // Stage 1: Ingest
  if (adapters.length > 0) {
    const feedResult = await runFeedIngestion(adapters);

    for (const error of feedResult.errors) {
      result.errors.push(`[${error.adapter}] ${error.error}`);
    }

    for (const listing of feedResult.listings) {
      try {
        await listingRepo.upsertFromFeed(listing);
        result.ingested++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`[upsert] ${listing.externalId}: ${msg}`);
      }
    }

    console.log(`[feedPipeline] Stage 1 complete: ${result.ingested} ingested`);
  }

  // Stage 2: Enrich
  const pendingListings = await listingRepo.findPendingEnrichment(enrichmentBatchSize);
  const enrichedListingIds: string[] = [];

  const concurrency = feedPipeline.enrichmentConcurrency;
  for (let i = 0; i < pendingListings.length; i += concurrency) {
    const batch = pendingListings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing) => {
        if (!listing.address) {
          await listingRepo.updateEnrichmentStatus(listing.id, 'failed');
          result.enrichFailed++;
          result.errors.push(`[enrich] ${listing.id}: no address`);
          return;
        }

        const enrichResult = await enrichListing(listing.address);

        if (!enrichResult.ok) {
          await listingRepo.updateEnrichmentStatus(listing.id, 'failed');
          result.enrichFailed++;
          result.errors.push(`[enrich] ${listing.id}: ${enrichResult.error}`);
          return;
        }

        await listingRepo.insertEnrichment(listing.id, enrichResult.data.enrichment);
        await listingRepo.updateEnrichmentStatus(listing.id, 'complete');
        enrichedListingIds.push(listing.id);
        result.enriched++;
      }),
    );
  }

  console.log(`[feedPipeline] Stage 2 complete: ${result.enriched} enriched, ${result.enrichFailed} failed`);

  // Stage 3: Match
  for (const listingId of enrichedListingIds) {
    const matchResult = await matchListingAgainstProfiles(listingId);
    if (matchResult.ok) {
      result.matched += matchResult.data.scored;
      result.alertsCreated += matchResult.data.alertsCreated;
    } else {
      result.errors.push(`[match] ${listingId}: ${matchResult.error}`);
    }
  }

  console.log(
    `[feedPipeline] Stage 3 complete: ${result.matched} scored, ${result.alertsCreated} alerts created`,
  );

  return result;
}
