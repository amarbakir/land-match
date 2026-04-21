import { describe, it, expect } from 'vitest';
import {
  computeSimplifiedScore,
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getScoreColor,
} from '../shared/scoring';

describe('computeSimplifiedScore', () => {
  it('returns null when no data components are available', () => {
    // Bug this catches: if null isn't returned, the overlay shows "0" which
    // looks like a terrible score rather than "no data"
    expect(computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: null })).toBeNull();
  });

  it('scores Class I soil + zone X as excellent (high 90s)', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: 1, femaFloodZone: 'X' });
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it('scores Class VIII soil + zone AE as poor (low 10-20s)', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: 8, femaFloodZone: 'AE' });
    expect(score).toBeLessThanOrEqual(12);
  });

  it('returns soil-only score when flood zone is null', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: 2, femaFloodZone: null });
    expect(score).not.toBeNull();
    // Class II soil = 100 - (2-1)*14 = 86
    expect(score).toBe(86);
  });

  it('returns flood-only score when soil is null', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'X' });
    expect(score).toBe(95);
  });

  it('averages soil and flood components', () => {
    // Class III soil = 100 - 2*14 = 72, zone X flood = 95
    // Average = (72 + 95) / 2 = 83.5 → rounds to 84
    const score = computeSimplifiedScore({ soilCapabilityClass: 3, femaFloodZone: 'X' });
    expect(score).toBe(84);
  });

  it('floors soil score at 0 for extreme capability classes', () => {
    // Class 8: 100 - 7*14 = 2. Already above 0 but test the formula works.
    // If someone passes class 9 (shouldn't happen but defensive), score should be >= 0
    const score = computeSimplifiedScore({ soilCapabilityClass: 9, femaFloodZone: null });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('treats zone B and C as low flood risk (same as X)', () => {
    // Bug this catches: if we only handle zone X, users in B/C zones
    // get incorrectly flagged as high flood risk
    const scoreB = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'B' });
    const scoreC = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'C' });
    const scoreX = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'X' });
    expect(scoreB).toBe(scoreX);
    expect(scoreC).toBe(scoreX);
  });

  it('treats zone V (coastal flood) as high risk', () => {
    const score = computeSimplifiedScore({ soilCapabilityClass: null, femaFloodZone: 'VE' });
    expect(score).toBe(20);
  });

  it('assigns unknown flood zones a moderate score', () => {
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
  it('returns green for minimal-risk zones', () => {
    expect(getFloodColor('X')).toBe('#22c55e');
    expect(getFloodColor('B')).toBe('#22c55e');
    expect(getFloodColor('C')).toBe('#22c55e');
  });

  it('returns red for high-risk zones', () => {
    expect(getFloodColor('A')).toBe('#ef4444');
    expect(getFloodColor('AE')).toBe('#ef4444');
    expect(getFloodColor('VE')).toBe('#ef4444');
  });

  it('returns gray for null/unknown', () => {
    expect(getFloodColor(null)).toBe('#6b7280');
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

describe('getScoreColor', () => {
  it('returns green for scores >= 70', () => {
    expect(getScoreColor(70)).toBe('#22c55e');
    expect(getScoreColor(100)).toBe('#22c55e');
  });

  it('returns yellow for scores 40-69', () => {
    expect(getScoreColor(40)).toBe('#eab308');
    expect(getScoreColor(69)).toBe('#eab308');
  });

  it('returns red for scores < 40', () => {
    expect(getScoreColor(39)).toBe('#ef4444');
    expect(getScoreColor(0)).toBe('#ef4444');
  });
});
