import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock enrichListing (network I/O — geocode + external APIs)
vi.mock('@landmatch/enrichment', () => ({
  enrichListing: vi.fn(),
}));

// Mock DB layer (database I/O)
vi.mock('../db/client', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock('../repos/listingRepo', () => ({
  insertListing: vi.fn(),
  insertEnrichment: vi.fn(),
}));

import { enrichListing } from '@landmatch/enrichment';
import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { enrichAndPersist } from '../services/listingService';

const mockEnrichListing = vi.mocked(enrichListing);
const mockTransaction = vi.mocked(db.transaction);
const mockInsertListing = vi.mocked(listingRepo.insertListing);
const mockInsertEnrichment = vi.mocked(listingRepo.insertEnrichment);

// Realistic fixture matching what enrichListing actually returns
function makeEnrichResult(overrides?: { errors?: Array<{ source: string; error: string }> }) {
  return {
    ok: true as const,
    data: {
      geocode: { lat: 36.6, lng: -92.1, matchedAddress: '123 Rural Rd, Ozark County, MO' },
      enrichment: {
        soil: {
          capabilityClass: 3,
          drainageClass: 'well drained',
          texture: 'loam',
          suitabilityRatings: { cropland: 85 },
        },
        flood: { zone: 'X', description: 'Minimal flood hazard' },
        sourcesUsed: ['usda', 'fema'],
        errors: overrides?.errors ?? [],
      },
    },
  };
}

// Realistic DB row fixtures
const listingRow = {
  id: 'lst-001',
  source: 'manual',
  address: '123 Rural Rd, MO',
  latitude: 36.6,
  longitude: -92.1,
  price: 50000,
  acreage: 40,
  enrichmentStatus: 'enriched',
  url: null,
  title: null,
  externalId: null,
  description: null,
  city: null,
  county: null,
  state: null,
  zip: null,
  rawData: null,
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  delistedAt: null,
};

const enrichmentRow = {
  id: 'enr-001',
  listingId: 'lst-001',
  soilCapabilityClass: 3,
  soilDrainageClass: 'well drained',
  soilTexture: 'loam',
  soilSuitabilityRatings: { cropland: 85 },
  femaFloodZone: 'X',
  floodZoneDescription: 'Minimal flood hazard',
  zoningCode: null,
  zoningDescription: null,
  verifiedAcreage: null,
  parcelGeometry: null,
  fireRiskScore: null,
  floodRiskScore: null,
  heatRiskScore: null,
  droughtRiskScore: null,
  enrichedAt: new Date(),
  sourcesUsed: ['usda', 'fema'],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: transaction executes the callback with a fake tx
  mockTransaction.mockImplementation(async (cb: any) => cb('fake-tx'));
  mockInsertListing.mockResolvedValue(listingRow);
  mockInsertEnrichment.mockResolvedValue(enrichmentRow);
});

describe('enrichAndPersist', () => {
  it('propagates geocode failure as error result', async () => {
    // Bug this catches: if we forget to check enrichResult.ok, we'd try
    // to destructure .data on a failed result → runtime crash or garbage in DB
    mockEnrichListing.mockResolvedValue({
      ok: false,
      error: 'Geocode failed: no match for address',
    });

    const result = await enrichAndPersist({ address: 'nonsense address xyz' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Geocode failed');
    }
    // Must NOT attempt DB writes on geocode failure
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('passes geocoded coordinates to listing repo, not raw input', async () => {
    // Bug this catches: using some other lat/lng (e.g., from input or hardcoded)
    // instead of the geocode result would place the listing in the wrong location
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO', price: 50000 });

    expect(result.ok).toBe(true);
    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 36.6,
        longitude: -92.1,
      }),
      'fake-tx', // must use transaction context
    );
  });

  it('persists both listing and enrichment within the same transaction', async () => {
    // Bug this catches: if insertListing and insertEnrichment use different
    // tx contexts (or no tx), a failure in the second leaves an orphaned listing
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({ address: '123 Rural Rd, MO' });

    // Both repo calls receive the same tx object
    // insertListing(input, tx) — tx at index 1
    // insertEnrichment(listingId, result, tx) — tx at index 2
    const listingTx = mockInsertListing.mock.calls[0][1];
    const enrichmentTx = mockInsertEnrichment.mock.calls[0][2];
    expect(listingTx).toBe('fake-tx');
    expect(enrichmentTx).toBe('fake-tx');
  });

  it('preserves enrichment errors in the response', async () => {
    // Bug this catches: if we only return data from the DB row (which doesn't
    // store adapter errors), the client never learns that some data sources failed
    const errors = [{ source: 'fema', error: 'timeout after 10s' }];
    mockEnrichListing.mockResolvedValue(makeEnrichResult({ errors }));

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.enrichment.errors).toEqual(errors);
    }
  });

  it('coalesces null sourcesUsed from DB to empty array', async () => {
    // Bug this catches: if the DB returns null for sourcesUsed (text[] column),
    // returning it raw would break client code that iterates over the array
    mockEnrichListing.mockResolvedValue(makeEnrichResult());
    mockInsertEnrichment.mockResolvedValue({ ...enrichmentRow, sourcesUsed: null });

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.enrichment.sourcesUsed).toEqual([]);
    }
  });

  it('returns INTERNAL_ERROR when the transaction throws', async () => {
    // Bug this catches: if the try/catch is removed or doesn't cover the
    // transaction, an unexpected DB error (connection lost, constraint violation)
    // would bubble up as an unhandled exception and crash the request handler
    mockEnrichListing.mockResolvedValue(makeEnrichResult());
    mockTransaction.mockRejectedValue(new Error('connection terminated'));

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INTERNAL_ERROR');
    }
  });
});
