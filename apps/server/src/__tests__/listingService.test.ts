import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock ONLY enrichListing (network I/O — geocode + external APIs);
// deriveEnrichmentStatus is pure and runs for real.
vi.mock('@landmatch/enrichment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@landmatch/enrichment')>();
  return { ...actual, enrichListing: vi.fn() };
});

// Mock DB layer (database I/O)
vi.mock('../db/client', () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock('../repos/listingRepo', () => ({
  MAX_ENRICHMENT_ATTEMPTS: 5,
  insertListing: vi.fn(),
  reviveListing: vi.fn(),
  insertEnrichment: vi.fn(),
  insertEnrichmentCopy: vi.fn(),
  updateHomesteadScore: vi.fn(),
  findByUrl: vi.fn(),
  findEnrichmentSourceByUrl: vi.fn(),
}));

vi.mock('../services/matchingService', () => ({
  matchListingAgainstProfiles: vi.fn(),
}));

import { enrichListing } from '@landmatch/enrichment';
import { db } from '../db/client';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from '../services/matchingService';
import { enrichAndPersist } from '../services/listingService';

const mockEnrichListing = vi.mocked(enrichListing);
const mockTransaction = vi.mocked(db.transaction);
const mockInsertListing = vi.mocked(listingRepo.insertListing);
const mockReviveListing = vi.mocked(listingRepo.reviveListing);
const mockInsertEnrichment = vi.mocked(listingRepo.insertEnrichment);
const mockInsertEnrichmentCopy = vi.mocked(listingRepo.insertEnrichmentCopy);
const mockUpdateHomesteadScore = vi.mocked(listingRepo.updateHomesteadScore);
const mockFindByUrl = vi.mocked(listingRepo.findByUrl);
const mockFindEnrichmentSource = vi.mocked(listingRepo.findEnrichmentSourceByUrl);
const mockMatchListing = vi.mocked(matchListingAgainstProfiles);

// Realistic fixture matching what enrichListing actually returns
function makeEnrichResult(overrides?: {
  errors?: Array<{ source: string; error: string }>;
  sourcesUsed?: string[];
}) {
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
        sourcesUsed: overrides?.sourcesUsed ?? ['usda', 'fema'],
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
  enrichmentAttempts: 0,
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
  userId: null,
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
  sourcesUsed: ['usda', 'fema'],
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: transaction executes the callback with a fake tx
  mockTransaction.mockImplementation(async (cb: any) => cb('fake-tx'));
  mockInsertListing.mockResolvedValue(listingRow);
  mockInsertEnrichment.mockResolvedValue(enrichmentRow);
  mockMatchListing.mockResolvedValue({ ok: true, data: { scored: 1, alertsCreated: 0 } });
});

describe('enrichAndPersist', () => {
  it('propagates geocode failure as error result', async () => {
    // Bug this catches: if we forget to check enrichResult.ok, we'd try
    // to destructure .data on a failed result → runtime crash or garbage in DB
    mockEnrichListing.mockResolvedValue({
      ok: false,
      error: 'Geocode failed: no match for address',
    });

    const result = await enrichAndPersist({ address: 'nonsense address xyz' }, 'user-1');

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

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO', price: 50000 }, 'user-1');

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

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

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

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

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

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

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

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INTERNAL_ERROR');
    }
  });

  it('passes userId to insertListing', async () => {
    // Bug this catches: if the userId is not forwarded from the route handler,
    // extension-submitted listings are never associated with the user, making
    // the "saved listings" feature silently broken
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-abc');

    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' }),
      'fake-tx',
    );
  });

  it('passes source and externalId from input to repo', async () => {
    // Bug this catches: if source is always 'manual', we can't distinguish
    // extension-submitted listings from web app submissions
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({
      address: '123 Rural Rd, MO',
      source: 'landwatch',
      externalId: 'lw-99887766',
    }, 'user-1');

    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'landwatch',
        externalId: 'lw-99887766',
      }),
      'fake-tx',
    );
  });

  // Bug these catch: enrichmentStatus was hardcoded 'enriched', so a full
  // vendor outage still produced 'enriched' rows that nothing ever retried.
  it("stores status 'enriched' when every adapter succeeded", async () => {
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({ enrichmentStatus: 'enriched' }),
      'fake-tx',
    );
  });

  it("stores status 'partial' when some adapters failed", async () => {
    mockEnrichListing.mockResolvedValue(
      makeEnrichResult({ sourcesUsed: ['usda'], errors: [{ source: 'fema', error: 'HTTP 503' }] }),
    );

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({ enrichmentStatus: 'partial' }),
      'fake-tx',
    );
  });

  it("stores status 'failed' when every adapter failed", async () => {
    mockEnrichListing.mockResolvedValue(
      makeEnrichResult({
        sourcesUsed: [],
        errors: [
          { source: 'usda', error: 'timeout' },
          { source: 'fema', error: 'HTTP 500' },
        ],
      }),
    );

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(mockInsertListing).toHaveBeenCalledWith(
      expect.objectContaining({ enrichmentStatus: 'failed' }),
      'fake-tx',
    );
  });

  it('triggers matching against search profiles after persist', async () => {
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(mockMatchListing).toHaveBeenCalledWith('lst-001');
  });

  it('does not block response if matching fails', async () => {
    mockEnrichListing.mockResolvedValue(makeEnrichResult());
    mockMatchListing.mockRejectedValue(new Error('matching exploded'));

    const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

    expect(result.ok).toBe(true);
  });

  it('does not trigger matching when enrichment fails', async () => {
    mockEnrichListing.mockResolvedValue({
      ok: false,
      error: 'Geocode failed',
    });

    await enrichAndPersist({ address: 'bad address' }, 'user-1');

    expect(mockMatchListing).not.toHaveBeenCalled();
  });

  it('computes and persists homesteadScore within the transaction', async () => {
    // Bug this catches: if the score is never written, getSavedListings has
    // nothing to read and silently falls back to per-request compute forever.
    mockEnrichListing.mockResolvedValue(makeEnrichResult());

    await enrichAndPersist({ address: '123 Rural Rd, MO', price: 50000, acreage: 40 }, 'user-1');

    expect(mockUpdateHomesteadScore).toHaveBeenCalledTimes(1);
    const [listingId, score, tx] = mockUpdateHomesteadScore.mock.calls[0];
    expect(listingId).toBe(listingRow.id); // same listing inserted in this txn
    expect(typeof score).toBe('number');   // a real, enriched listing scores a number
    expect(tx).toBe('fake-tx');            // written inside the transaction
  });

  describe('dedupe by URL', () => {
    // Bugs these catch (land-match-0jx.10): every repeat POST /enrich inserted
    // a fresh listing row and re-ran the vendor fan-out — duplicate listings,
    // each re-scored against every profile → multiplied alert emails.
    const URL = 'https://www.landwatch.com/listing/123';

    it('returns the existing visible listing without vendor calls, inserts, or re-matching', async () => {
      mockFindByUrl.mockResolvedValue({ listing: { ...listingRow, url: URL }, enrichment: enrichmentRow });

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.listing.id).toBe(listingRow.id);
      expect(mockEnrichListing).not.toHaveBeenCalled();   // no vendor quota burned
      expect(mockInsertListing).not.toHaveBeenCalled();   // no duplicate row
      expect(mockMatchListing).not.toHaveBeenCalled();    // no re-score → no duplicate alerts
    });

    it("returns a visible-but-unenriched feed row as-is — healing is the re-enrichment cron's job", async () => {
      // Deliberate: forking an owned duplicate of a feed row would get BOTH
      // scored against the owner's profiles → two alerts for one property.
      mockFindByUrl.mockResolvedValue({
        listing: { ...listingRow, url: URL, userId: null, enrichmentStatus: 'pending' },
        enrichment: null,
      });

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.listing.enrichmentStatus).toBe('pending');
      expect(mockEnrichListing).not.toHaveBeenCalled();
      expect(mockInsertListing).not.toHaveBeenCalled();
    });

    it('re-runs the pipeline into a fresh owned row when a FEED row is a dead end', async () => {
      // Bug this catches: a feed row with no enrichment data and an exhausted
      // retry budget short-circuiting every future POST /enrich — the user
      // could never obtain soil/flood data for that URL again.
      mockFindByUrl.mockResolvedValue({
        listing: { ...listingRow, url: URL, userId: null, enrichmentStatus: 'failed', enrichmentAttempts: 5 },
        enrichment: null,
      });
      mockFindEnrichmentSource.mockResolvedValue(null);
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockEnrichListing).toHaveBeenCalled();
      expect(mockInsertListing).toHaveBeenCalled(); // ownerless dead row: fork an owned row, no index conflict
    });

    it("heals the caller's OWN dead-end row in place — the unique index forbids forking it", async () => {
      // Bug this catches (review of land-match-ckt): the dead-row escape hatch
      // falling through to an INSERT that conflicts with the caller's own row
      // on listings_user_url_idx — the "loser" path then serves the dead row
      // back, burning vendor quota and returning null enrichment forever.
      mockFindByUrl.mockResolvedValue({
        listing: { ...listingRow, url: URL, userId: 'user-1', enrichmentStatus: 'failed', enrichmentAttempts: 5 },
        enrichment: null,
      });
      mockEnrichListing.mockResolvedValue(makeEnrichResult());
      mockReviveListing.mockResolvedValue({ ...listingRow, url: URL, userId: 'user-1', enrichmentStatus: 'enriched' });

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockInsertListing).not.toHaveBeenCalled(); // no second (user, url) row
      expect(mockReviveListing).toHaveBeenCalledWith(
        listingRow.id,
        expect.objectContaining({ latitude: 36.6, longitude: -92.1, enrichmentStatus: 'enriched' }),
        'fake-tx',
      );
      // Stale scores from the dead era must refresh, not be skipped
      expect(mockMatchListing).toHaveBeenCalledWith(listingRow.id, { rescore: true });
    });

    it('still short-circuits on an unenriched row the cron WILL heal (attempts remaining)', async () => {
      mockFindByUrl.mockResolvedValue({
        listing: { ...listingRow, url: URL, enrichmentStatus: 'pending', enrichmentAttempts: 1 },
        enrichment: null,
      });

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockEnrichListing).not.toHaveBeenCalled();
      expect(mockInsertListing).not.toHaveBeenCalled();
    });

    it("copies another user's enrichment into a caller-owned row instead of re-enriching", async () => {
      // Post-0jx.1 the extension's by-url pre-check is visibility-scoped, so
      // user B enriching a URL user A already enriched falls through to POST
      // /enrich — that must reuse A's vendor data, not re-burn quota.
      mockFindByUrl.mockResolvedValue(null);
      mockFindEnrichmentSource.mockResolvedValue({
        listingId: 'lst-source',
        address: '123 rural rd,  MO', // same address modulo case/whitespace
        latitude: 37.1,
        longitude: -91.5,
        enrichmentStatus: 'enriched',
        enrichment: enrichmentRow,
      });
      mockInsertEnrichmentCopy.mockResolvedValue({ ...enrichmentRow, id: 'enr-copy' });

      const result = await enrichAndPersist(
        { address: '123 Rural Rd, MO', url: URL, price: 60000 },
        'user-b',
      );

      expect(result.ok).toBe(true);
      expect(mockEnrichListing).not.toHaveBeenCalled();
      expect(mockInsertListing).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-b',       // fresh row owned by the caller, not shared
          latitude: 37.1,         // source row's geocode — no re-geocoding
          longitude: -91.5,
          url: URL,
          price: 60000,           // caller's own request fields win
        }),
        'fake-tx',
      );
      expect(mockInsertEnrichmentCopy).toHaveBeenCalledWith(listingRow.id, enrichmentRow, 'fake-tx');
      expect(mockMatchListing).toHaveBeenCalledWith(listingRow.id); // owner-scoped post-9vs
    });

    it('falls through to full enrichment when no row for the URL has enrichment data', async () => {
      mockFindByUrl.mockResolvedValue(null);
      mockFindEnrichmentSource.mockResolvedValue(null);
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockEnrichListing).toHaveBeenCalled();
      expect(mockInsertListing).toHaveBeenCalled();
    });

    it('falls through to full enrichment when the source row lacks coordinates', async () => {
      // A copy without lat/lng could never be healed by re-enrichment (the
      // candidate query filters on non-null coordinates).
      mockFindByUrl.mockResolvedValue(null);
      mockFindEnrichmentSource.mockResolvedValue({
        listingId: 'lst-source',
        address: '123 Rural Rd, MO',
        latitude: null,
        longitude: null,
        enrichmentStatus: 'enriched',
        enrichment: enrichmentRow,
      });
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockEnrichListing).toHaveBeenCalled();
      expect(mockInsertEnrichmentCopy).not.toHaveBeenCalled();
    });

    it("refuses to copy when the source address doesn't match — recycled URLs must re-geocode", async () => {
      // Bug this catches: a listing site reusing a URL for a different
      // property — copying would pin the OLD property's coordinates and
      // soil/flood data onto the caller's listing, confidently wrong.
      mockFindByUrl.mockResolvedValue(null);
      mockFindEnrichmentSource.mockResolvedValue({
        listingId: 'lst-source',
        address: '999 Different Creek Ln, AR',
        latitude: 37.1,
        longitude: -91.5,
        enrichmentStatus: 'enriched',
        enrichment: enrichmentRow,
      });
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      expect(mockInsertEnrichmentCopy).not.toHaveBeenCalled();
      expect(mockEnrichListing).toHaveBeenCalled(); // fresh geocode + vendors
    });

    it('serves the concurrent winner and merges the paid-for fan-out onto its row when losing the race', async () => {
      // Bugs this catches (land-match-ckt): insertListing returning null
      // (unique-index conflict) crashing or duplicating; and the loser
      // discarding its completed vendor fan-out — if the winner's run was the
      // partial one, the merge is what completes the row without the cron
      // re-burning vendor quota.
      mockFindByUrl.mockResolvedValueOnce(null); // pre-check: nothing visible yet
      mockFindEnrichmentSource.mockResolvedValue(null);
      mockEnrichListing.mockResolvedValue(makeEnrichResult());
      mockInsertListing.mockResolvedValue(null); // winner beat us
      mockFindByUrl.mockResolvedValueOnce({ listing: { ...listingRow, url: URL }, enrichment: enrichmentRow });

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO', url: URL }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.listing.id).toBe(listingRow.id);
      expect(mockInsertListing).toHaveBeenCalledTimes(1); // no retry-insert loop
      // The loser's enrichment merges onto the WINNER's row (coalesce semantics)
      expect(mockInsertEnrichment).toHaveBeenCalledWith(listingRow.id, expect.anything(), undefined);
    });

    it('skips the dedupe lookup entirely for URL-less manual submissions', async () => {
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

      expect(mockFindByUrl).not.toHaveBeenCalled();
      expect(mockFindEnrichmentSource).not.toHaveBeenCalled();
    });
  });

  describe('homestead scoring in response', () => {
    it('includes homesteadScore and homesteadComponents in response', async () => {
      // Bug this catches: if the response doesn't include homestead fields,
      // the extension overlay shows the old simplified score instead of the
      // full homestead breakdown
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveProperty('homesteadScore');
        expect(result.data).toHaveProperty('homesteadComponents');
        expect(typeof result.data.homesteadScore).toBe('number');
        expect(result.data.homesteadScore).toBeGreaterThanOrEqual(0);
        expect(result.data.homesteadScore).toBeLessThanOrEqual(100);
      }
    });

    it('returns all 7 homestead component scores', async () => {
      // Bug this catches: if a component is missing from the response,
      // the ScoreCard renders a gap in the bar list
      mockEnrichListing.mockResolvedValue(makeEnrichResult());

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expected = [
          'gardenViability', 'growingSeason', 'waterAvailability',
          'floodSafety', 'septicFeasibility', 'buildingSuitability', 'firewoodPotential',
        ];
        const keys = Object.keys(result.data.homesteadComponents!);
        expect(keys.sort()).toEqual(expected.sort());

        // Each component must have score and label
        for (const key of expected) {
          const comp = result.data.homesteadComponents![key];
          expect(comp).toHaveProperty('score');
          expect(comp).toHaveProperty('label');
          expect(typeof comp.score).toBe('number');
          expect(typeof comp.label).toBe('string');
          expect(comp.label.length).toBeGreaterThan(0);
        }
      }
    });

    it('maps DB column names correctly to scoring types', async () => {
      // Bug this catches: femaFloodZone→floodZone and wetlandWithinBufferFt→wetlandDistanceFt
      // name mismatches would silently pass undefined, giving wrong scores
      const enrichedRow = {
        ...enrichmentRow,
        femaFloodZone: 'AE',
        frostFreeDays: 180,
        annualPrecipIn: 45,
        elevationFt: 1200,
        slopePct: 5,
        wetlandType: 'PFO1A',
        wetlandWithinBufferFt: 500,
        soilDrainageClass: 'well drained',
        soilTexture: 'loam',
      };
      mockEnrichListing.mockResolvedValue(makeEnrichResult());
      mockInsertEnrichment.mockResolvedValue(enrichedRow);

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // floodSafety should reflect AE zone (high risk → low score)
        const floodSafety = result.data.homesteadComponents!.floodSafety;
        expect(floodSafety.score).toBeLessThan(50);

        // gardenViability should reflect good soil (class 3, loam, well drained)
        const garden = result.data.homesteadComponents!.gardenViability;
        expect(garden.score).toBeGreaterThan(0);
      }
    });

    it('does not crash when enrichment row is null', async () => {
      // Bug this catches: if toScoringEnrichment doesn't guard against null,
      // it throws TypeError when trying to read properties of null
      mockEnrichListing.mockResolvedValue(makeEnrichResult());
      mockInsertEnrichment.mockResolvedValue(null as any);

      const result = await enrichAndPersist({ address: '123 Rural Rd, MO' }, 'user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should degrade gracefully with baseline scores, not crash
        expect(typeof result.data.homesteadScore).toBe('number');
        expect(result.data.homesteadComponents).not.toBeNull();
      }
    });
  });
});
