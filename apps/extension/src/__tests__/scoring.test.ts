import { describe, it, expect } from 'vitest';
import {
  computeSimplifiedScore,
  getOverallScore,
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getScoreColor,
  HOMESTEAD_DISPLAY_ORDER,
  HOMESTEAD_COMPONENT_LABELS,
} from '../shared/scoring';

describe('computeSimplifiedScore', () => {
  it('returns null when no data components are available', () => {
    // Bug this catches: if null isn't returned, the overlay shows "0" which
    // looks like a terrible score rather than "no data"
    expect(computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: null })).toBeNull();
  });

  it('scores Class I soil + zone X as excellent (100)', () => {
    // Uses canonical scores: scoreSoil(1) = 100, scoreFlood('X') = 100
    const score = computeSimplifiedScore({ soilCapabilityClass: 1, femaFloodZone: 'X' });
    expect(score).toBe(100);
  });

  it('scores Class VIII soil + zone AE as poor', () => {
    // scoreSoil(8) = 0, scoreFlood('AE') = 30 → avg = 15
    const score = computeSimplifiedScore({ soilCapabilityClass: 8, femaFloodZone: 'AE' });
    expect(score).toBe(15);
  });

  it('returns soil-only score when flood zone is null', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: 2, femaFloodZone: null });
    expect(score).not.toBeNull();
    // scoreSoil(2) = 85
    expect(score).toBe(85);
  });

  it('returns flood-only score when soil is null', () => {
    // scoreFlood('X') = 100
    const score = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'X' });
    expect(score).toBe(100);
  });

  it('averages soil and flood components', () => {
    // scoreSoil(3) = 65, scoreFlood('X') = 100
    // Average = (65 + 100) / 2 = 82.5 → rounds to 83
    const score = computeSimplifiedScore({ soilCapabilityClass: 3, femaFloodZone: 'X' });
    expect(score).toBe(83);
  });

  it('floors soil score at 0 for unknown capability classes', () => {
    // scoreSoil(9) is not in the lookup → returns 0
    const score = computeSimplifiedScore({ soilCapabilityClass: 9, femaFloodZone: null });
    expect(score).toBe(0);
  });

  it('scores zone B and C as moderate flood risk', () => {
    // Canonical scoring: B=70, C=70 (lower than X=100 but not high risk)
    const scoreB = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'B' });
    const scoreC = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'C' });
    expect(scoreB).toBe(70);
    expect(scoreC).toBe(70);
  });

  it('treats zone VE (coastal flood) as highest risk', () => {
    // scoreFlood('VE') = 0
    const score = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'VE' });
    expect(score).toBe(0);
  });

  it('assigns unknown flood zones a moderate score', () => {
    // scoreFlood('D') falls through to default = 50
    const score = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'D' });
    expect(score).toBe(50);
  });
});

describe('getSoilLabel', () => {
  it('returns "Unknown" for null', () => {
    expect(getSoilLabel(null)).toBe('Unknown');
  });

  it('returns labeled string for known classes', () => {
    expect(getSoilLabel(1)).toContain('Class I');
    expect(getSoilLabel(8)).toContain('Class VIII');
  });

  it('returns generic label for out-of-range class', () => {
    expect(getSoilLabel(10)).toBe('Class 10');
  });
});

describe('getFloodColor', () => {
  it('returns meadow green for minimal-risk zones', () => {
    expect(getFloodColor('X')).toBe('#7DB88A');
    expect(getFloodColor('B')).toBe('#7DB88A');
    expect(getFloodColor('C')).toBe('#7DB88A');
  });

  it('returns danger red for high-risk zones', () => {
    expect(getFloodColor('A')).toBe('#DC2626');
    expect(getFloodColor('AE')).toBe('#DC2626');
    expect(getFloodColor('VE')).toBe('#DC2626');
  });

  it('returns faint for null/unknown', () => {
    expect(getFloodColor(null)).toBe('#6B7363');
  });
});

describe('getFloodLabel', () => {
  it('returns "Unknown" for null', () => {
    expect(getFloodLabel(null)).toBe('Unknown');
  });

  it('returns descriptive label for known zones', () => {
    expect(getFloodLabel('X')).toBe('Minimal risk');
    expect(getFloodLabel('AE')).toContain('100-yr floodplain');
    expect(getFloodLabel('VE')).toContain('coastal');
  });

  it('passes through unknown zone codes as-is', () => {
    expect(getFloodLabel('D')).toBe('D');
  });
});

describe('getOverallScore', () => {
  it('prefers homesteadScore over simplified fallback', () => {
    // Bug this catches: if we use simplified score when homestead is available,
    // the overlay shows a stale/wrong number that ignores climate, elevation, etc.
    const data = {
      homesteadScore: 72,
      enrichment: { soilCapabilityClass: 8, femaFloodZone: 'AE' },
    };
    expect(getOverallScore(data)).toBe(72);
  });

  it('treats homesteadScore of 0 as a valid score, not falsy', () => {
    // Bug this catches: if we check `if (data.homesteadScore)` instead of
    // `if (data.homesteadScore != null)`, a score of 0 falls through to the
    // simplified score — a property in a floodplain with terrible soil looks
    // great instead of terrible
    const data = {
      homesteadScore: 0,
      enrichment: { soilCapabilityClass: 1, femaFloodZone: 'X' },
    };
    expect(getOverallScore(data)).toBe(0); // not 100 from simplified
  });

  it('falls back to simplified score when homesteadScore is null', () => {
    // Bug this catches: overlay shows nothing for older cached responses
    // that predate the homestead scoring feature
    const data = {
      homesteadScore: null,
      enrichment: { soilCapabilityClass: 1, femaFloodZone: 'X' },
    };
    expect(getOverallScore(data)).toBe(100); // simplified: avg(100, 100)
  });

  it('falls back to simplified score when homesteadScore field is missing', () => {
    // Bug this catches: old cached responses don't have homesteadScore field
    // at all. If we don't handle undefined, TypeError on property access
    const data = {
      enrichment: { soilCapabilityClass: 3, femaFloodZone: 'X' },
    } as any;
    expect(getOverallScore(data)).toBe(83); // simplified: avg(65, 100) = 82.5 → 83
  });

  it('rounds fractional homestead scores', () => {
    // Bug this catches: showing "72.3847" in the badge looks broken
    const data = {
      homesteadScore: 72.384,
      enrichment: { soilCapabilityClass: null, femaFloodZone: null },
    };
    expect(getOverallScore(data)).toBe(72);
  });

  it('returns null when both homestead and enrichment data are absent', () => {
    // Bug this catches: showing "0" instead of "no data" in the badge
    const data = {
      homesteadScore: null,
      enrichment: { soilCapabilityClass: null, femaFloodZone: null },
    };
    expect(getOverallScore(data)).toBeNull();
  });
});

describe('homestead display constants', () => {
  it('display order covers all labeled components', () => {
    // Bug this catches: adding a new component to labels but forgetting
    // to add it to display order → component silently hidden in UI
    const labelKeys = Object.keys(HOMESTEAD_COMPONENT_LABELS).sort();
    const orderKeys = [...HOMESTEAD_DISPLAY_ORDER].sort();
    expect(orderKeys).toEqual(labelKeys);
  });
});

describe('getScoreColor', () => {
  it('returns meadow green for high scores (>=80)', () => {
    expect(getScoreColor(80)).toBe('#7DB88A');
    expect(getScoreColor(100)).toBe('#7DB88A');
  });

  it('returns clay for mid scores (60-79)', () => {
    expect(getScoreColor(60)).toBe('#C4956A');
    expect(getScoreColor(79)).toBe('#C4956A');
  });

  it('returns golden wheat for low scores (40-59)', () => {
    expect(getScoreColor(40)).toBe('#D4A843');
    expect(getScoreColor(59)).toBe('#D4A843');
  });

  it('returns danger red for failing scores (<40)', () => {
    expect(getScoreColor(39)).toBe('#DC2626');
    expect(getScoreColor(0)).toBe('#DC2626');
  });
});
