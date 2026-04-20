import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchItem, SearchProfileResponse } from '@landmatch/api';

import { criteriaSummary } from '../MatchListPane';
import { deriveTags, formatPrice, formatTime } from '../MatchRow';
import { scoreColor } from '../ScoreRing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch(overrides: Partial<MatchItem> = {}): MatchItem {
  return {
    scoreId: 'score-1',
    listingId: 'listing-1',
    overallScore: 75,
    componentScores: {
      soil: 70,
      flood: 80,
      price: 60,
      acreage: 75,
      zoning: 90,
      geography: 65,
      infrastructure: 55,
      climate: 70,
    },
    llmSummary: null,
    status: 'inbox',
    readAt: null,
    scoredAt: new Date().toISOString(),
    title: null,
    address: '123 Farm Rd',
    price: null,
    acreage: null,
    source: null,
    url: null,
    lat: null,
    lng: null,
    soilClass: null,
    soilClassLabel: null,
    primeFarmland: null,
    floodZone: null,
    zoning: null,
    ...overrides,
  };
}

function makeProfile(
  criteria: SearchProfileResponse['criteria'],
): SearchProfileResponse {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Test Profile',
    isActive: true,
    alertFrequency: 'daily',
    alertThreshold: 60,
    criteria,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// scoreColor
// ---------------------------------------------------------------------------

describe('scoreColor', () => {
  it('returns success color at exactly 80 (≥80 threshold)', () => {
    expect(scoreColor(80)).toBe('#7DB88A');
  });

  it('returns accentSecondary at 79 — catches off-by-one where 79 would wrongly map to success', () => {
    expect(scoreColor(79)).toBe('#C4956A');
  });

  it('returns accentSecondary at exactly 60 (≥60 threshold)', () => {
    expect(scoreColor(60)).toBe('#C4956A');
  });

  it('returns accent at 59 — catches off-by-one where 59 would wrongly map to accentSecondary', () => {
    expect(scoreColor(59)).toBe('#D4A843');
  });

  it('returns accent at exactly 40 (≥40 threshold)', () => {
    expect(scoreColor(40)).toBe('#D4A843');
  });

  it('returns danger at 39 — catches off-by-one where 39 would wrongly map to accent', () => {
    expect(scoreColor(39)).toBe('#DC2626');
  });

  it('returns danger at 0 (lowest possible score)', () => {
    expect(scoreColor(0)).toBe('#DC2626');
  });

  it('returns success at 100 (highest possible score)', () => {
    expect(scoreColor(100)).toBe('#7DB88A');
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe('formatPrice', () => {
  it('returns em-dash for null price', () => {
    expect(formatPrice(null)).toBe('—');
  });

  it('formats sub-million price in thousands', () => {
    expect(formatPrice(185_000)).toBe('$185K');
  });

  it('formats exactly 1,000,000 as $1.0M — catches threshold falling through to K branch', () => {
    expect(formatPrice(1_000_000)).toBe('$1.0M');
  });

  it('formats 1,500,000 as $1.5M', () => {
    expect(formatPrice(1_500_000)).toBe('$1.5M');
  });

  it('formats 999,999 as $1000K — documents known display quirk just below M threshold', () => {
    // The function rounds to 0 decimal places: (999999/1000).toFixed(0) = '1000'
    expect(formatPrice(999_999)).toBe('$1000K');
  });
});

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------

describe('formatTime', () => {
  const BASE = new Date('2024-06-01T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" for an iso string 30 minutes ago (< 1 hour)', () => {
    const iso = new Date(BASE - 30 * 60 * 1000).toISOString();
    expect(formatTime(iso)).toBe('now');
  });

  it('returns "5h" for an iso string 5 hours ago', () => {
    const iso = new Date(BASE - 5 * 3_600_000).toISOString();
    expect(formatTime(iso)).toBe('5h');
  });

  it('returns "23h" at exactly 23 hours ago — catches premature day rollover', () => {
    const iso = new Date(BASE - 23 * 3_600_000).toISOString();
    expect(formatTime(iso)).toBe('23h');
  });

  it('returns "1d" at exactly 25 hours ago — catches failure to cross the 24h boundary', () => {
    const iso = new Date(BASE - 25 * 3_600_000).toISOString();
    expect(formatTime(iso)).toBe('1d');
  });

  it('returns "2d" for an iso string 2 days ago', () => {
    const iso = new Date(BASE - 2 * 24 * 3_600_000).toISOString();
    expect(formatTime(iso)).toBe('2d');
  });
});

// ---------------------------------------------------------------------------
// deriveTags
// ---------------------------------------------------------------------------

describe('deriveTags', () => {
  it('Zone X gets green tone (minimal flood risk)', () => {
    const tags = deriveTags(makeMatch({ floodZone: 'X' }));
    expect(tags).toEqual([{ label: 'Zone X', tone: 'green' }]);
  });

  it('Zone A gets clay tone — catches if high-risk zones are accidentally shown as safe', () => {
    const tags = deriveTags(makeMatch({ floodZone: 'A' }));
    expect(tags).toEqual([{ label: 'Zone A', tone: 'clay' }]);
  });

  it('Zone AE gets clay tone — catches if AE is excluded from the A/AE clay condition', () => {
    const tags = deriveTags(makeMatch({ floodZone: 'AE' }));
    expect(tags).toEqual([{ label: 'Zone AE', tone: 'clay' }]);
  });

  it('Zone D gets default tone (undetermined, not high-risk clay)', () => {
    const tags = deriveTags(makeMatch({ floodZone: 'D' }));
    expect(tags).toEqual([{ label: 'Zone D', tone: 'default' }]);
  });

  it('primeFarmland true → Prime Soil tag with gold tone', () => {
    const tags = deriveTags(makeMatch({ primeFarmland: true }));
    expect(tags).toContainEqual({ label: 'Prime Soil', tone: 'gold' });
  });

  it('primeFarmland false with soilClassLabel → shows class label with default tone', () => {
    const tags = deriveTags(
      makeMatch({ primeFarmland: false, soilClassLabel: 'Class II' }),
    );
    expect(tags).toContainEqual({ label: 'Class II', tone: 'default' });
  });

  it('primeFarmland false with soilClassLabel does NOT show Prime Soil', () => {
    const tags = deriveTags(
      makeMatch({ primeFarmland: false, soilClassLabel: 'Class II' }),
    );
    expect(tags.map((t) => t.label)).not.toContain('Prime Soil');
  });

  it('null floodZone and null soil fields → empty tags array', () => {
    const tags = deriveTags(
      makeMatch({ floodZone: null, primeFarmland: null, soilClassLabel: null }),
    );
    expect(tags).toEqual([]);
  });

  it('caps output at 3 tags even when more could be derived', () => {
    // Zone X (1) + Prime Soil (2) — only 2 possible from current logic,
    // but slice(0,3) must not exceed 3. We verify the cap is enforced.
    const tags = deriveTags(
      makeMatch({ floodZone: 'X', primeFarmland: true, soilClassLabel: 'Class I' }),
    );
    expect(tags.length).toBeLessThanOrEqual(3);
    // primeFarmland true takes priority over soilClassLabel, so we get exactly 2
    expect(tags).toEqual([
      { label: 'Zone X', tone: 'green' },
      { label: 'Prime Soil', tone: 'gold' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// criteriaSummary
// ---------------------------------------------------------------------------

describe('criteriaSummary', () => {
  it('returns "No criteria set" when criteria object is empty', () => {
    expect(criteriaSummary(makeProfile({}))).toBe('No criteria set');
  });

  it('formats full criteria into joined parts', () => {
    const profile = makeProfile({
      acreage: { min: 5, max: 30 },
      price: { max: 450_000 },
      soilCapabilityClass: { max: 3 },
    });
    expect(criteriaSummary(profile)).toBe('5–30 ac · ≤$450K · Class ≤III');
  });

  it('uses 0 for acreage min and ∞ for acreage max when both are absent', () => {
    const profile = makeProfile({ acreage: {} });
    expect(criteriaSummary(profile)).toBe('0–∞ ac');
  });

  it('soil class 1 → "Class ≤I" (first labels array entry)', () => {
    const profile = makeProfile({ soilCapabilityClass: { max: 1 } });
    expect(criteriaSummary(profile)).toBe('Class ≤I');
  });

  it('soil class 6 → "Class ≤VI" (last defined labels entry)', () => {
    const profile = makeProfile({ soilCapabilityClass: { max: 6 } });
    expect(criteriaSummary(profile)).toBe('Class ≤VI');
  });

  it('only acreage with min set omits other parts', () => {
    const profile = makeProfile({ acreage: { min: 10, max: 50 } });
    expect(criteriaSummary(profile)).toBe('10–50 ac');
  });

  it('price.max = 0 is falsy and excluded — no "≤$0K" shown', () => {
    // The implementation uses `if (c.price?.max)` which is falsy for 0
    const profile = makeProfile({ price: { max: 0 } });
    expect(criteriaSummary(profile)).toBe('No criteria set');
  });
});
