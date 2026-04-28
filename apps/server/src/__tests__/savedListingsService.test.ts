import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../repos/listingRepo');
vi.mock('../db/client', () => ({
  db: { transaction: vi.fn() },
}));
vi.mock('../services/matchingService', () => ({
  matchListingAgainstProfiles: vi.fn(),
}));

import * as listingRepo from '../repos/listingRepo';
import { getSavedListings, unsaveListing } from '../services/listingService';

const mockFindSaved = vi.mocked(listingRepo.findSavedListings);
const mockUnsave = vi.mocked(listingRepo.unsaveListing);

// Realistic saved listing row matching what the repo returns
function makeSavedRow(overrides: Partial<{
  soilClass: number | null;
  floodZone: string | null;
  price: number | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
  bestScoreValue: number | null;
  bestScoreProfileName: string | null;
}> = {}) {
  return {
    id: 'sl-001',
    savedAt: new Date('2026-04-25T10:00:00Z'),
    listingId: 'lst-001',
    title: '40 Acres — Ozark County',
    address: '123 Rural Rd, MO',
    price: overrides.price ?? 50000,
    acreage: overrides.acreage ?? 40,
    source: 'landwatch',
    url: 'https://www.landwatch.com/listing/123',
    lat: overrides.lat ?? 36.6,
    lng: overrides.lng ?? -92.1,
    soilClass: overrides.soilClass ?? 2,
    floodZone: overrides.floodZone ?? 'X',
    zoning: 'A-1',
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
    bestScoreValue: overrides.bestScoreValue ?? null,
    bestScoreProfileName: overrides.bestScoreProfileName ?? null,
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
      rows: [makeSavedRow({ bestScoreValue: null, bestScoreProfileName: null })],
      total: 1,
    });

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0].bestScore).toBeNull();
    }
  });

  it('sorts by homesteadScore in-memory when sort=homestead', async () => {
    // Bug this catches: homestead sorting happens in-memory (score is computed,
    // not a DB column). If we forget to sort or sort wrong direction, the user
    // sees listings in arbitrary order when they choose "sort by score"
    const row1 = { ...makeSavedRow({ soilClass: 6, floodZone: 'AE' }), id: 'sl-bad', listingId: 'lst-bad' };
    const row2 = { ...makeSavedRow({ soilClass: 1, floodZone: 'X' }), id: 'sl-good', listingId: 'lst-good' };
    mockFindSaved.mockResolvedValue({ rows: [row1, row2], total: 2 });

    const result = await getSavedListings('user-1', { sort: 'homestead', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Best score should come first in desc order
      expect(result.data.items[0].listingId).toBe('lst-good');
      expect(result.data.items[1].listingId).toBe('lst-bad');
      expect(result.data.items[0].homesteadScore!).toBeGreaterThan(
        result.data.items[1].homesteadScore!,
      );
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
