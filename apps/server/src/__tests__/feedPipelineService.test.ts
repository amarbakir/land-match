import { afterEach, describe, expect, it, vi } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as matchingService from '../services/matchingService';
import { runPipeline } from '../services/feedPipelineService';
import { ok } from '@landmatch/api';
import type { FeedAdapter } from '@landmatch/feeds';

vi.mock('../repos/listingRepo');
vi.mock('../services/matchingService');
vi.mock('@landmatch/enrichment', () => ({
  enrichListing: vi.fn(),
}));

const mockListingRepo = vi.mocked(listingRepo);
const mockMatchingService = vi.mocked(matchingService);

afterEach(() => vi.restoreAllMocks());

describe('feedPipelineService.runPipeline', () => {
  it('ingests feed listings via upsertFromFeed', async () => {
    const adapter: FeedAdapter = {
      name: 'test',
      fetchListings: async () => ok([{
        externalId: 'ext-1',
        source: 'test',
        url: 'https://example.com/1',
        title: 'Test Listing',
        rawData: {},
      }]),
    };

    mockListingRepo.upsertFromFeed.mockResolvedValueOnce({
      id: 'listing-1',
      enrichmentStatus: 'pending',
    } as any);
    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([]);

    const result = await runPipeline([adapter]);

    expect(result.ingested).toBe(1);
    expect(mockListingRepo.upsertFromFeed).toHaveBeenCalledOnce();
  });

  it('enriches pending listings and runs matching on completed ones', async () => {
    const { enrichListing } = await import('@landmatch/enrichment');
    const mockEnrich = vi.mocked(enrichListing);

    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([
      { id: 'listing-1', address: '123 Main St', enrichmentStatus: 'pending' } as any,
    ]);
    mockEnrich.mockResolvedValueOnce(ok({
      geocode: { lat: 42.0, lng: -73.0, matchedAddress: '123 MAIN ST' },
      enrichment: { sourcesUsed: ['usda', 'fema'], errors: [] },
    }));
    mockListingRepo.insertEnrichment.mockResolvedValueOnce({} as any);
    mockListingRepo.updateEnrichmentStatus.mockResolvedValueOnce(undefined);
    mockMatchingService.matchListingAgainstProfiles.mockResolvedValueOnce(
      ok({ scored: 2, alertsCreated: 1 }),
    );

    const result = await runPipeline([], 10);

    expect(result.enriched).toBe(1);
    expect(result.matched).toBe(2);
    expect(result.alertsCreated).toBe(1);
  });
});
