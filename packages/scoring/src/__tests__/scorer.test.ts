import { describe, expect, it } from 'vitest';

import { scorePrice } from '../components';
import { scoreListing } from '../scorer';
import type { SearchCriteria } from '../types';

describe('scorePrice', () => {
  // Bug: with min === max the ramp divides by zero — 0/0 = NaN was stored
  // as overall_score, NaN >= threshold silently false, UI rendered 'NaN'.
  it('returns a perfect score when price hits a degenerate range (min === max)', () => {
    expect(scorePrice(250_000, { min: 250_000, max: 250_000 })).toBe(100);
  });

  it('still applies the over-budget penalty when min === max', () => {
    expect(scorePrice(300_000, { min: 250_000, max: 250_000 })).toBeLessThan(70);
  });
});

describe('scoreListing NaN/bounds hardening', () => {
  it('yields a finite overall score for a degenerate price range', () => {
    const result = scoreListing(
      { price: 250_000, acreage: 10 },
      {},
      { price: { min: 250_000, max: 250_000 } },
    );
    expect(Number.isFinite(result.overallScore)).toBe(true);
  });

  // Legacy rows created before weight validation can hold negative weights;
  // without a guard they push the weighted average outside 0-100.
  it('keeps overall score within 0-100 when stored criteria contain negative weights', () => {
    const criteria: SearchCriteria = {
      weights: {
        soil: 1, flood: 0, price: 0, acreage: 0,
        zoning: 0, geography: 0, infrastructure: 0, climate: -0.9,
      },
    };
    const result = scoreListing({}, { soilCapabilityClass: 1 }, criteria);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});
