import { afterEach, describe, expect, it, vi } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as matchingService from '../services/matchingService';
import { runPipeline } from '../services/feedPipelineService';
import { ok, err } from '@landmatch/api';
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
  it('ingests feed listings and passes them to upsertFromFeed', async () => {
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
    expect(result.errors).toHaveLength(0);
  });

  it('captures upsert failures without aborting remaining listings', async () => {
    const adapter: FeedAdapter = {
      name: 'test',
      fetchListings: async () => ok([
        { externalId: 'ext-1', source: 'test', url: 'u1', title: 't1', rawData: {} },
        { externalId: 'ext-2', source: 'test', url: 'u2', title: 't2', rawData: {} },
      ]),
    };

    mockListingRepo.upsertFromFeed
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockResolvedValueOnce({ id: 'listing-2' } as any);
    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([]);

    const result = await runPipeline([adapter]);

    expect(result.ingested).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('unique constraint');
  });

  it('skips enrichment for listings without address and marks them failed', async () => {
    const { enrichListing } = await import('@landmatch/enrichment');
    const mockEnrich = vi.mocked(enrichListing);

    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([
      { id: 'listing-1', address: null, enrichmentStatus: 'pending' } as any,
    ]);
    mockListingRepo.updateEnrichmentStatus.mockResolvedValueOnce(undefined);

    const result = await runPipeline([], 10);

    expect(result.enrichFailed).toBe(1);
    expect(result.enriched).toBe(0);
    expect(mockEnrich).not.toHaveBeenCalled();
    expect(mockListingRepo.updateEnrichmentStatus).toHaveBeenCalledWith('listing-1', 'failed');
  });

  it('marks listings as failed when enrichment returns an error', async () => {
    const { enrichListing } = await import('@landmatch/enrichment');
    const mockEnrich = vi.mocked(enrichListing);

    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([
      { id: 'listing-1', address: '123 Main St', enrichmentStatus: 'pending' } as any,
    ]);
    mockEnrich.mockResolvedValueOnce(err('Geocode failed'));
    mockListingRepo.updateEnrichmentStatus.mockResolvedValueOnce(undefined);

    const result = await runPipeline([], 10);

    expect(result.enrichFailed).toBe(1);
    expect(result.enriched).toBe(0);
    expect(mockListingRepo.updateEnrichmentStatus).toHaveBeenCalledWith('listing-1', 'failed');
    expect(result.errors).toContainEqual(expect.stringContaining('Geocode failed'));
  });

  it('enriches listings and chains into matching stage', async () => {
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
    expect(mockListingRepo.updateEnrichmentStatus).toHaveBeenCalledWith('listing-1', 'complete');
  });
});
