import { describe, expect, it, vi, beforeEach } from 'vitest';

// Isolate computeHomestead from the scoring engine so we can force a failure.
// (The main listingService.test.ts uses the REAL scoring engine on purpose;
// forcing a throw there would poison every other test in that file.)
vi.mock('@landmatch/scoring', () => ({
  homesteadScore: vi.fn(() => {
    throw new Error('scoring engine blew up');
  }),
  mapListingRow: vi.fn((x) => x),
  mapEnrichmentRow: vi.fn((x) => x),
}));
vi.mock('@landmatch/enrichment', () => ({ enrichListing: vi.fn() }));
vi.mock('../db/client', () => ({ db: {} }));
vi.mock('../repos/listingRepo', () => ({ findSavedListings: vi.fn() }));
vi.mock('../services/matchingService', () => ({ matchListingAgainstProfiles: vi.fn() }));
vi.mock('../lib/captureError', () => ({ captureError: vi.fn() }));

import { captureError } from '../lib/captureError';
import * as listingRepo from '../repos/listingRepo';
import { computeHomestead, getSavedListings } from '../services/listingService';

const mockCaptureError = vi.mocked(captureError);
const mockFindSaved = vi.mocked(listingRepo.findSavedListings);

// A pre-backfill saved row (homesteadScore null) that will trigger the recompute
// fallback — which throws here because the scoring engine is mocked to throw.
function nullScoreRow(id: string, homesteadScore: number | null = null) {
  return {
    id,
    savedAt: new Date('2026-04-25T10:00:00Z'),
    listingId: `lst-${id}`,
    title: 't',
    address: 'a',
    price: 50000,
    acreage: 40,
    source: 'landwatch',
    url: 'https://example.com',
    lat: 36.6,
    lng: -92.1,
    soilClass: 2,
    floodZone: 'X',
    zoning: 'A-1',
    homesteadScore,
    soilDrainageClass: null,
    soilTexture: null,
    fireRiskScore: null,
    floodRiskScore: null,
    frostFreeDays: null,
    annualPrecipIn: null,
    avgMinTempF: null,
    avgMaxTempF: null,
    growingSeasonDays: null,
    elevationFt: null,
    slopePct: null,
    wetlandType: null,
    wetlandWithinBufferFt: null,
    bestScoreValue: null,
    bestScoreProfileName: null,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeHomestead error handling', () => {
  // Bug this catches: reverting the catch to a bare `catch {}` (as it was before
  // land-match-cge.7) makes a systematic scoring bug invisible — every listing
  // silently shows no score with zero signal in logs/Sentry. This asserts the
  // failure is BOTH swallowed gracefully AND reported.
  it('captures the error and degrades to a null score when scoring throws', () => {
    const result = computeHomestead(
      { id: 'lst-1', price: 50000, acreage: 40, latitude: 36.6, longitude: -92.1 } as never,
      { id: 'enr-1' } as never,
    );

    // Degrades, does not throw out of the request path
    expect(result).toEqual({ homesteadScore: null, homesteadComponents: null });

    // ...and the operator gets a signal instead of silence
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    expect(mockCaptureError).toHaveBeenCalledWith(
      expect.any(Error),
      'listingService.computeHomestead',
    );
  });
});

describe('getSavedListings recompute-failure reporting', () => {
  // Bug this catches: land-match-cge.7's first cut reported inside the per-row
  // fallback, so a systematic scoring bug fired one Sentry event PER saved row
  // per request (quota exhaustion). The report must be aggregated to once per
  // request, while each row still degrades to a null score.
  it('reports scoring failures once per request, not once per row', async () => {
    mockFindSaved.mockResolvedValue({
      rows: [nullScoreRow('1'), nullScoreRow('2'), nullScoreRow('3')],
      total: 3,
    } as never);

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    // Request still succeeds; every row degrades to a null score
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(3);
      expect(result.data.items.every((i) => i.homesteadScore === null)).toBe(true);
    }

    // Exactly one aggregated report for the whole batch of 3 failures
    const recomputeCalls = mockCaptureError.mock.calls.filter(
      ([, ctx]) => ctx === 'listingService.getSavedListings.recompute',
    );
    expect(recomputeCalls).toHaveLength(1);
  });

  it('does not report when no rows need recomputing', async () => {
    // Bug this catches: an off-by-one that reports even when recomputeFailures is 0.
    mockFindSaved.mockResolvedValue({
      rows: [nullScoreRow('1', 55)],
      total: 1,
    } as never);

    const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

    expect(result.ok).toBe(true);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
