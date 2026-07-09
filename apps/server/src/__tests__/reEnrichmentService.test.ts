import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock only the vendor pipeline; deriveEnrichmentStatus stays real (pure).
vi.mock('@landmatch/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@landmatch/enrichment')>();
  return { ...actual, runEnrichmentPipeline: vi.fn() };
});

vi.mock('../db/client', () => ({
  db: { transaction: vi.fn() },
}));

vi.mock('../repos/listingRepo');
vi.mock('../services/matchingService');

import { runEnrichmentPipeline } from '@landmatch/enrichment';

import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from '../services/matchingService';
import { reEnrichPendingListings } from '../services/reEnrichmentService';

const mockPipeline = vi.mocked(runEnrichmentPipeline);
const mockRepo = vi.mocked(listingRepo);
const mockMatch = vi.mocked(matchListingAgainstProfiles);
const mockTransaction = vi.mocked(db.transaction);

function makeListing(id: string) {
  return {
    id,
    source: 'manual',
    externalId: null,
    url: null,
    title: null,
    description: null,
    price: 50000,
    acreage: 40,
    address: '123 Rural Rd, MO',
    city: null,
    county: null,
    state: null,
    zip: null,
    latitude: 36.6,
    longitude: -92.1,
    rawData: null,
    enrichmentStatus: 'failed',
    enrichmentAttempts: 1,
    userId: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    delistedAt: null,
  };
}

const enrichmentRow = {
  id: 'enr-1',
  listingId: 'lst-1',
  soilCapabilityClass: 3,
  soilDrainageClass: 'well drained',
  soilTexture: 'loam',
  soilSuitabilityRatings: null,
  femaFloodZone: 'X',
  floodZoneDescription: null,
  zoningCode: null,
  zoningDescription: null,
  verifiedAcreage: null,
  parcelGeometry: null,
  fireRiskScore: null,
  floodRiskScore: null,
  heatRiskScore: null,
  droughtRiskScore: null,
  frostFreeDays: null,
  annualPrecipIn: null,
  avgMinTempF: null,
  avgMaxTempF: null,
  growingSeasonDays: null,
  elevationFt: null,
  slopePct: null,
  wetlandType: null,
  wetlandDescription: null,
  wetlandWithinBufferFt: null,
  homesteadScore: null,
  enrichedAt: new Date(),
  sourcesUsed: ['usda-soil', 'fema-nfhl'],
};

const fullSuccess = {
  soil: { capabilityClass: 3, drainageClass: 'well drained', texture: 'loam', suitabilityRatings: {} },
  flood: { zone: 'X', description: 'Minimal flood hazard' },
  sourcesUsed: ['usda-soil', 'fema-nfhl'],
  errors: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(async (cb: any) => cb('fake-tx'));
  mockRepo.insertEnrichment.mockResolvedValue(enrichmentRow as any);
  mockRepo.updateHomesteadScore.mockResolvedValue(undefined);
  mockRepo.recordEnrichmentAttempt.mockResolvedValue(undefined);
  mockMatch.mockResolvedValue({ ok: true, data: { scored: 1, alertsCreated: 0 } });
});

describe('reEnrichPendingListings', () => {
  it('re-enriches a candidate, marks it enriched, bumps attempts, and rescores', async () => {
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([makeListing('lst-1')] as any);
    mockPipeline.mockResolvedValue(fullSuccess);

    const result = await reEnrichPendingListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.enriched).toBe(1);
    // Background run: retries are safe here, unlike the interactive endpoint
    expect(mockPipeline).toHaveBeenCalledWith({ lat: 36.6, lng: -92.1 }, { retry: true });
    expect(mockRepo.insertEnrichment).toHaveBeenCalledWith('lst-1', fullSuccess, 'fake-tx');
    // Status must come from the run outcome, and attempts must be consumed
    expect(mockRepo.recordEnrichmentAttempt).toHaveBeenCalledWith('lst-1', 'enriched', 'fake-tx');
    // Stale neutral scores get refreshed, not skipped
    expect(mockMatch).toHaveBeenCalledWith('lst-1', { rescore: true });
  });

  it("derives status from the MERGED row — a partial run completing coverage yields 'enriched'", async () => {
    // Run 1 got soil, run 2 gets flood but soil times out. The merged row has
    // both, so the listing must leave the retry loop instead of being
    // re-selected (and burning vendor quota) forever.
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([makeListing('lst-1')] as any);
    mockPipeline.mockResolvedValue({
      flood: { zone: 'X', description: 'Minimal flood hazard' },
      sourcesUsed: ['fema-nfhl'],
      errors: [{ source: 'usda-soil', error: 'timeout' }],
    });
    // insertEnrichment returns the merged row: soil (from run 1) + flood (run 2)
    mockRepo.insertEnrichment.mockResolvedValue({
      ...enrichmentRow,
      sourcesUsed: ['usda-soil', 'fema-nfhl'],
    } as any);

    const result = await reEnrichPendingListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.enriched).toBe(1);
    expect(result.data.partial).toBe(0);
    expect(mockRepo.recordEnrichmentAttempt).toHaveBeenCalledWith('lst-1', 'enriched', 'fake-tx');
  });

  it('keeps the old enrichment row and status when the new run produces nothing', async () => {
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([makeListing('lst-1')] as any);
    mockPipeline.mockResolvedValue({
      sourcesUsed: [],
      errors: [{ source: 'usda-soil', error: 'timeout' }],
    });

    const result = await reEnrichPendingListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.failed).toBe(1);
    // A fully-failed run must not wipe previously-persisted partial data...
    expect(mockRepo.insertEnrichment).not.toHaveBeenCalled();
    // ...but still consumes retry budget so outages can't retry forever
    expect(mockRepo.recordEnrichmentAttempt).toHaveBeenCalledWith('lst-1', undefined);
    expect(mockMatch).not.toHaveBeenCalled();
  });

  it('one listing failing does not abort the rest of the batch', async () => {
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([
      makeListing('lst-1'),
      makeListing('lst-2'),
    ] as any);
    mockPipeline.mockResolvedValue(fullSuccess);
    mockTransaction
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockImplementation(async (cb: any) => cb('fake-tx'));

    const result = await reEnrichPendingListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.enriched).toBe(1);
    expect(result.data.errors).toHaveLength(1);
    expect(mockPipeline).toHaveBeenCalledTimes(2);
    // The failed listing still consumes retry budget — a poison listing that
    // always throws on persist must not bypass the attempt cap and burn
    // vendor quota on every cron run forever.
    expect(mockRepo.recordEnrichmentAttempt).toHaveBeenCalledWith('lst-1', undefined);
  });

  it('stops processing when the deadline has passed', async () => {
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([
      makeListing('lst-1'),
      makeListing('lst-2'),
    ] as any);
    mockPipeline.mockResolvedValue(fullSuccess);

    const result = await reEnrichPendingListings({ deadlineAt: Date.now() - 1000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Nothing processed — the deadline check must come before vendor calls
    expect(mockPipeline).not.toHaveBeenCalled();
    expect(result.data.processed).toBe(0);
  });

  it('does not start a listing that cannot finish before the deadline', async () => {
    // A single listing can legitimately take ~31s (15s adapter timeout,
    // jittered sleep, 15s retry). Starting one with only a few seconds left
    // gets the Lambda hard-killed mid-listing: transaction rolls back, no
    // attempt is recorded, and the same slow listing leads the next run too.
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([makeListing('lst-1')] as any);
    mockPipeline.mockResolvedValue(fullSuccess);

    const result = await reEnrichPendingListings({ deadlineAt: Date.now() + 10_000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockPipeline).not.toHaveBeenCalled();
    expect(result.data.processed).toBe(0);
  });

  it('does nothing when there are no candidates', async () => {
    mockRepo.findListingsNeedingEnrichment.mockResolvedValue([]);

    const result = await reEnrichPendingListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.processed).toBe(0);
    expect(mockPipeline).not.toHaveBeenCalled();
  });
});
