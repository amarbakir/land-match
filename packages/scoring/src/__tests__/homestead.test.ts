import { describe, expect, it } from 'vitest';
import { scoreGardenViability } from '../homestead/gardenViability';
import { scoreGrowingSeason } from '../homestead/growingSeason';
import type { EnrichmentData } from '../types';

describe('scoreGardenViability', () => {
  it('scores excellent garden soil (Class I, well-drained, loam)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 1,
      soilDrainageClass: 'Well drained',
      soilTexture: 'Silt loam',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toContain('excellent');
  });

  it('scores poor garden soil (Class VII, poorly drained, clay)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 7,
      soilDrainageClass: 'Poorly drained',
      soilTexture: 'Clay',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.label).toContain('poor');
  });

  it('scores moderate garden soil (Class III, moderate drainage)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 3,
      soilDrainageClass: 'Moderately well drained',
      soilTexture: 'Sandy loam',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it('returns neutral score when data is missing', () => {
    const result = scoreGardenViability({});
    expect(result.score).toBe(50);
    expect(result.label).toContain('Unknown');
  });

  it('handles partial data — only soil class', () => {
    const result = scoreGardenViability({ soilCapabilityClass: 2 });
    // Should still compute something meaningful, not crash
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('clamps score to 0-100 even with worst inputs', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 8,
      soilDrainageClass: 'Very poorly drained',
      soilTexture: 'Heavy clay',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('scoreGrowingSeason', () => {
  it('scores long growing season (200+ frost-free days, mild winters)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 200, avgMinTempF: 35 });
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toContain('frost-free days');
    expect(result.label).toContain('excellent');
  });

  it('scores short growing season (90 frost-free days, cold)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 90, avgMinTempF: 10 });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('scores moderate growing season (140 frost-free days)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 140, avgMinTempF: 25 });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreGrowingSeason({});
    expect(result.score).toBe(50);
    expect(result.label).toContain('Unknown');
  });

  it('penalizes very cold winters (avgMinTempF < 0)', () => {
    const cold = scoreGrowingSeason({ frostFreeDays: 150, avgMinTempF: -5 });
    const mild = scoreGrowingSeason({ frostFreeDays: 150, avgMinTempF: 35 });
    expect(cold.score).toBeLessThan(mild.score);
  });

  it('clamps at boundaries (60 frost-free days = floor)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 60, avgMinTempF: -10 });
    expect(result.score).toBe(0);
  });
});
