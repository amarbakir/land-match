import { describe, expect, it } from 'vitest';

import { CreateSearchProfile, SearchCriteria } from '../searchProfiles';

describe('SearchCriteria validation', () => {
  // Bug guard: min > max produced a negative divisor in scorePrice's ramp,
  // and min === max produced 0/0 = NaN stored as overall_score.
  it('rejects price range with min > max', () => {
    const result = SearchCriteria.safeParse({ price: { min: 500_000, max: 100_000 } });
    expect(result.success).toBe(false);
  });

  it('rejects acreage range with min > max', () => {
    const result = SearchCriteria.safeParse({ acreage: { min: 40, max: 5 } });
    expect(result.success).toBe(false);
  });

  it('accepts a range with min === max', () => {
    const result = SearchCriteria.safeParse({ price: { min: 250_000, max: 250_000 } });
    expect(result.success).toBe(true);
  });

  it('accepts open-ended ranges (only min or only max)', () => {
    expect(SearchCriteria.safeParse({ price: { min: 100_000 } }).success).toBe(true);
    expect(SearchCriteria.safeParse({ acreage: { max: 40 } }).success).toBe(true);
  });

  it('rejects negative weight values', () => {
    const result = SearchCriteria.safeParse({ weights: { flood: -1 } });
    expect(result.success).toBe(false);
  });

  it('rejects weight keys that are not scoring components', () => {
    const result = SearchCriteria.safeParse({ weights: { bogus: 1 } });
    expect(result.success).toBe(false);
  });

  it('accepts a partial set of valid component weights', () => {
    const result = SearchCriteria.safeParse({ weights: { flood: 2, soil: 0.5 } });
    expect(result.success).toBe(true);
  });

  // Bugs these catch (tcd.3 audit): unbounded criteria stored verbatim in
  // search_profiles.criteria jsonb and fed to the scoring engine.
  it('rejects weights above 100 (relative weights need no more headroom)', () => {
    expect(SearchCriteria.safeParse({ weights: { flood: 101 } }).success).toBe(false);
    expect(SearchCriteria.safeParse({ weights: { flood: 100 } }).success).toBe(true);
  });

  it('rejects out-of-range geography centers', () => {
    const geo = (lat: number, lng: number) =>
      SearchCriteria.safeParse({ geography: { type: 'radius', center: { lat, lng }, radiusMiles: 25 } });
    expect(geo(91, 0).success).toBe(false);
    expect(geo(-91, 0).success).toBe(false);
    expect(geo(0, 181).success).toBe(false);
    expect(geo(0, -181).success).toBe(false);
    expect(geo(36.6, -92.1).success).toBe(true);
  });

  it('rejects non-positive radiusMiles', () => {
    expect(SearchCriteria.safeParse({ geography: { type: 'radius', radiusMiles: 0 } }).success).toBe(false);
    expect(SearchCriteria.safeParse({ geography: { type: 'radius', radiusMiles: -5 } }).success).toBe(false);
  });

  it('bounds string-array filters in element length and count', () => {
    expect(SearchCriteria.safeParse({ floodZoneExclude: ['x'.repeat(101)] }).success).toBe(false);
    expect(SearchCriteria.safeParse({ zoning: Array.from({ length: 51 }, (_, i) => `z${i}`) }).success).toBe(false);
    expect(SearchCriteria.safeParse({ floodZoneExclude: ['AE', 'VE'], zoning: ['A-1'] }).success).toBe(true);
  });

  it('caps profile names at 200 characters', () => {
    expect(CreateSearchProfile.safeParse({ name: 'x'.repeat(201), criteria: {} }).success).toBe(false);
    expect(CreateSearchProfile.safeParse({ name: 'Hudson Valley', criteria: {} }).success).toBe(true);
  });
});
