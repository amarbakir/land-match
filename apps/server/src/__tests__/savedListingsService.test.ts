import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../repos/listingRepo');
vi.mock('../db/client', () => ({
  db: { transaction: vi.fn() },
}));
vi.mock('../services/matchingService', () => ({
  matchListingAgainstProfiles: vi.fn(),
}));

import * as listingRepo from '../repos/listingRepo';
import { getSavedListings, saveListing, unsaveListing } from '../services/listingService';

const mockFindSaved = vi.mocked(listingRepo.findSavedListings);
const mockUnsave = vi.mocked(listingRepo.unsaveListing);

// Realistic saved listing row matching what the repo returns
type SavedRow = Awaited<ReturnType<typeof listingRepo.findSavedListings>>['rows'][number];

function makeSavedRow(overrides: Partial<SavedRow> = {}): SavedRow {
  return {
    id: 'sl-001',
    savedAt: new Date('2026-04-25T10:00:00Z'),
    listingId: 'lst-001',
    title: '40 Acres — Ozark County',
    address: '123 Rural Rd, MO',
    price: 50000,
    acreage: 40,
    source: 'landwatch',
    url: 'https://www.landwatch.com/listing/123',
    lat: 36.6,
    lng: -92.1,
    soilClass: 2,
    floodZone: 'X',
    zoning: 'A-1',
    homesteadScore: null,
    soilDrainageClass: 'well drained',
    soilTexture: 'loam',
    fireRiskScore: null,
    floodRiskScore: null,
    frostFreeDays: 180,
    annualPrecipIn: 45,
    avgMinTempF: 28,
    avgMaxTempF: 88,
    growingSeasonDays: 190,
    elevationFt: 1200,
    slopePct: 5,
    wetlandType: null,
    wetlandWithinBufferFt: null,
    bestScoreValue: null!,
    bestScoreProfileName: null!,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSavedListings', () => {
  it('returns empty items array when user has no saved listings', async () => {
    // Bug this catches: if we iterate over empty rows without null checks,
    // or if we return {items: undefined} instead of {items: []}
    mockFindSaved.mockResolvedValue({ rows: [], total: 0 });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toEqual([]);
      expect(result.data.total).toBe(0);
    }
  });

  it('nulls out a stored non-web listing URL before it reaches clients', async () => {
    // Bug this catches: SavedView renders item.url via window.open; a stored
    // javascript: URL that predates schema validation must be dropped
    // server-side, not just at each render site.
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ url: 'javascript:alert(document.cookie)' })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].url).toBeNull();
    }
  });

  it('computes homesteadScore for each listing from enrichment data', async () => {
    // Bug this catches: if homesteadScore computation is skipped or broken,
    // the saved view shows no score rings — the primary visual indicator
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ soilClass: 2, floodZone: 'X' })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const item = result.data.items[0];
      expect(item.homesteadScore).not.toBeNull();
      expect(typeof item.homesteadScore).toBe('number');
      // Good soil (class 2) + minimal flood (X) should produce a decent score
      expect(item.homesteadScore!).toBeGreaterThan(40);
    }
  });

  it('does not crash when enrichment data is entirely null', async () => {
    // Bug this catches: if mapEnrichmentRow or homesteadScore throws on null
    // inputs, the entire saved listings endpoint returns 500 for ALL users
    // just because one listing has missing enrichment
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({
        soilClass: null,
        floodZone: null,
        lat: null,
        lng: null,
        price: null,
        acreage: null,
      })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should still return the item — score might be null but shouldn't crash
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].listingId).toBe('lst-001');
    }
  });

  it('maps bestScore correctly when a profile score exists', async () => {
    // Bug this catches: if bestScore mapping forgets the profileName or returns
    // wrong shape, the "85 in Homestead Search" badge breaks in the UI
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ bestScoreValue: 85, bestScoreProfileName: 'Ozark Homestead' })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].bestScore).toEqual({
        score: 85,
        profileName: 'Ozark Homestead',
      });
    }
  });

  it('sets bestScore to null when no profile has scored the listing', async () => {
    // Bug this catches: if we return { score: null, profileName: null } instead
    // of null, the frontend conditionally renders a broken badge
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow()], // default has null! for bestScoreValue/bestScoreProfileName
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].bestScore).toBeNull();
    }
  });

  it('preserves the repo (SQL) order for sort=homestead instead of re-sorting the page', async () => {
    // Bug this catches: homestead ordering lives in SQL (persisted column) so
    // pagination is globally ordered. Re-sorting the page in memory here —
    // e.g. by a recomputed display score that differs from the persisted one —
    // would shuffle rows within the page and break cross-page ordering.
    const row1 = { ...makeSavedRow(), id: 'sl-first', listingId: 'lst-first', homesteadScore: 90 };
    const row2 = { ...makeSavedRow(), id: 'sl-second', listingId: 'lst-second', homesteadScore: 55 };
    mockFindSaved.mockResolvedValue({ rows: [row1, row2], total: 2 });

    const result = await getSavedListings('user-1', { sort: 'homestead', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(mockFindSaved).toHaveBeenCalledWith('user-1', expect.objectContaining({ sort: 'homestead', sortDir: 'desc' }));
      expect(result.data.items.map((i) => i.listingId)).toEqual(['lst-first', 'lst-second']);
    }
  });

  it('serializes savedAt as ISO string, not Date object', async () => {
    // Bug this catches: if we pass the raw Date to the API response,
    // JSON.stringify might produce unexpected format or the Zod schema rejects it
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow()],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.items[0].savedAt).toBe('string');
      expect(result.data.items[0].savedAt).toBe('2026-04-25T10:00:00.000Z');
    }
  });

  it('returns INTERNAL_ERROR when repo throws', async () => {
    // Bug this catches: unhandled promise rejection on DB connection loss
    // would crash the process instead of returning a clean error
    mockFindSaved.mockRejectedValue(new Error('connection terminated'));

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INTERNAL_ERROR');
    }
  });

  it('passes filter params to repo correctly', async () => {
    // Bug this catches: if filters are not forwarded (e.g., limit defaults
    // to 20 always), the user can never paginate past page 1
    mockFindSaved.mockResolvedValue({ rows: [], total: 0 });

    await getSavedListings('user-1', { sort: 'price', sortDir: 'asc', limit: 10, offset: 30 });

    expect(mockFindSaved).toHaveBeenCalledWith('user-1', {
      sort: 'price',
      sortDir: 'asc',
      limit: 10,
      offset: 30,
    });
  });

  it('returns the persisted homesteadScore when present, without recomputing', async () => {
    // Bug this catches: if the read path ignores the stored column and always
    // recomputes, the persistence work is pointless. The fixture uses a score
    // (7) that the scorer would never produce for this good-soil row, so a pass
    // proves we read the column rather than recomputing.
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: 7 })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].homesteadScore).toBe(7);
    }
  });

  it('treats a persisted score of 0 as valid, not a fallback trigger', async () => {
    // Bug this catches: a `homesteadScore || compute()` truthiness check would
    // discard a legitimate 0 (hard-filtered listing) and recompute.
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: 0 })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].homesteadScore).toBe(0);
    }
  });

  it('falls back to computing the score when the persisted column is null', async () => {
    // Bug this catches: pre-backfill rows have null homesteadScore; if there is
    // no fallback the UI shows no score ring for them.
    mockFindSaved.mockResolvedValue({
      rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: null })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const score = result.data.items[0].homesteadScore;
      expect(score).not.toBeNull();
      expect(score!).toBeGreaterThan(40); // good soil (class 2) + minimal flood (X)
    }
  });
});

describe('saveListing', () => {
  const mockSave = vi.mocked(listingRepo.saveListing);
  const mockFindVisible = vi.mocked(listingRepo.findVisibleListing);
  const visibleListing = { id: 'lst-1' } as Awaited<ReturnType<typeof listingRepo.findVisibleListing>>;

  it("returns NOT_FOUND for another user's listing without touching saved_listings", async () => {
    // Bug this catches: no visibility check on save — any authenticated user
    // who learned a listing id could save it and read its full row + enrichment
    // via GET /saved. Invisible must be indistinguishable from nonexistent.
    mockFindVisible.mockResolvedValue(null);

    const result = await saveListing('user-b', 'lst-owned-by-a');

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockFindVisible).toHaveBeenCalledWith('lst-owned-by-a', 'user-b');
  });

  it('maps an FK violation (listing deleted after visibility check) to NOT_FOUND, not a raw 500', async () => {
    // Bug this catches: the route calling the repo directly — an unknown id
    // threw the raw pg FK-violation (constraint/table names) into the response.
    // Still reachable post-visibility-check if the listing is deleted between
    // the lookup and the insert.
    mockFindVisible.mockResolvedValue(visibleListing);
    mockSave.mockRejectedValue(Object.assign(new Error('violates foreign key constraint'), { code: '23503' }));

    const result = await saveListing('user-1', 'lst-nonexistent');

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('returns savedAt for a fresh save and tolerates an already-saved conflict', async () => {
    const savedAt = new Date('2026-07-09T00:00:00Z');
    mockFindVisible.mockResolvedValue(visibleListing);
    mockSave.mockResolvedValueOnce({ savedAt } as Awaited<ReturnType<typeof listingRepo.saveListing>>);

    const fresh = await saveListing('user-1', 'lst-1');
    expect(fresh.ok && fresh.data.savedAt).toBe(savedAt.toISOString());

    // onConflictDoNothing returns undefined when already saved — still ok
    mockSave.mockResolvedValueOnce(undefined as never);
    const dup = await saveListing('user-1', 'lst-1');
    expect(dup.ok).toBe(true);
  });
});

describe('unsaveListing', () => {
  it('returns NOT_FOUND when listing was not saved', async () => {
    // Bug this catches: returning ok() when nothing was deleted would make
    // the frontend think the action succeeded, confusing the user
    mockUnsave.mockResolvedValue(false);

    const result = await unsaveListing('user-1', 'lst-nonexistent');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NOT_FOUND');
    }
  });

  it('returns ok on successful unsave', async () => {
    mockUnsave.mockResolvedValue(true);

    const result = await unsaveListing('user-1', 'lst-001');

    expect(result.ok).toBe(true);
  });

  it('passes userId AND listingId to repo (not just listingId)', async () => {
    // Bug this catches: if we only pass listingId, any user could unsave
    // any other user's listing — a broken authorization check
    mockUnsave.mockResolvedValue(true);

    await unsaveListing('user-abc', 'lst-999');

    expect(mockUnsave).toHaveBeenCalledWith('user-abc', 'lst-999');
  });

  it('returns INTERNAL_ERROR when repo throws', async () => {
    mockUnsave.mockRejectedValue(new Error('connection reset'));

    const result = await unsaveListing('user-1', 'lst-001');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INTERNAL_ERROR');
    }
  });
});
