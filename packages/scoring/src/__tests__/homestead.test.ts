import { describe, expect, it } from 'vitest';
import { scoreGardenViability } from '../homestead/gardenViability';
import { scoreGrowingSeason } from '../homestead/growingSeason';
import { scoreWaterAvailability } from '../homestead/waterAvailability';
import { scoreFloodSafety } from '../homestead/floodSafety';
import { scoreSepticFeasibility } from '../homestead/septicFeasibility';
import { scoreBuildingSuitability } from '../homestead/buildingSuitability';
import { scoreFirewoodPotential } from '../homestead/firewoodPotential';
import { homesteadScore } from '../homestead/scorer';
import type { EnrichmentData, ListingData, SearchCriteria } from '../types';

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

describe('scoreWaterAvailability', () => {
  it('scores high precip with good drainage as excellent', () => {
    const result = scoreWaterAvailability({
      annualPrecipIn: 48,
      soilDrainageClass: 'Well drained',
      wetlandType: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.label).toContain('excellent');
  });

  it('scores low precip as poor', () => {
    const result = scoreWaterAvailability({
      annualPrecipIn: 15,
      soilDrainageClass: 'Well drained',
      wetlandType: null,
    });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('gives bonus for nearby wetland (water source)', () => {
    const withWetland = scoreWaterAvailability({
      annualPrecipIn: 35,
      wetlandType: 'PFO1A',
      wetlandDistanceFt: 200,
    });
    const without = scoreWaterAvailability({
      annualPrecipIn: 35,
      wetlandType: null,
    });
    expect(withWetland.score).toBeGreaterThan(without.score);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreWaterAvailability({});
    expect(result.score).toBe(50);
    expect(result.label).toContain('Unknown');
  });

  it('penalizes excessively drained soil (water drains too fast)', () => {
    const excessive = scoreWaterAvailability({
      annualPrecipIn: 40,
      soilDrainageClass: 'Excessively drained',
    });
    const moderate = scoreWaterAvailability({
      annualPrecipIn: 40,
      soilDrainageClass: 'Moderately well drained',
    });
    expect(moderate.score).toBeGreaterThan(excessive.score);
  });
});

describe('scoreFloodSafety', () => {
  it('scores Zone X with high elevation as excellent', () => {
    const result = scoreFloodSafety({ floodZone: 'X', elevationFt: 1200, slopePct: 5 });
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('scores Zone AE as poor', () => {
    const result = scoreFloodSafety({ floodZone: 'AE', elevationFt: 200, slopePct: 1 });
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('penalizes very flat terrain (pooling risk)', () => {
    const flat = scoreFloodSafety({ floodZone: 'X', slopePct: 0.5 });
    const sloped = scoreFloodSafety({ floodZone: 'X', slopePct: 5 });
    expect(sloped.score).toBeGreaterThan(flat.score);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreFloodSafety({});
    expect(result.score).toBe(50);
  });
});

describe('scoreSepticFeasibility', () => {
  it('scores well-drained loam with gentle slope as excellent', () => {
    const result = scoreSepticFeasibility({
      soilTexture: 'Sandy loam',
      soilDrainageClass: 'Well drained',
      slopePct: 5,
      wetlandType: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('scores clay with poor drainage as poor', () => {
    const result = scoreSepticFeasibility({
      soilTexture: 'Clay',
      soilDrainageClass: 'Poorly drained',
      slopePct: 2,
      wetlandType: 'PFO1A',
      wetlandDistanceFt: 80,
    });
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('penalizes steep slopes', () => {
    const gentle = scoreSepticFeasibility({
      soilTexture: 'Loam',
      soilDrainageClass: 'Well drained',
      slopePct: 5,
    });
    const steep = scoreSepticFeasibility({
      soilTexture: 'Loam',
      soilDrainageClass: 'Well drained',
      slopePct: 30,
    });
    expect(gentle.score).toBeGreaterThan(steep.score);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreSepticFeasibility({});
    expect(result.score).toBe(50);
  });
});

describe('scoreBuildingSuitability', () => {
  it('scores gentle slope in Zone X as excellent', () => {
    const result = scoreBuildingSuitability({ slopePct: 3, elevationFt: 800, floodZone: 'X' });
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('penalizes very steep slope', () => {
    const result = scoreBuildingSuitability({ slopePct: 35, elevationFt: 800, floodZone: 'X' });
    expect(result.score).toBeLessThanOrEqual(50);
  });

  it('penalizes flood-prone zones', () => {
    const safe = scoreBuildingSuitability({ slopePct: 5, floodZone: 'X' });
    const flood = scoreBuildingSuitability({ slopePct: 5, floodZone: 'AE' });
    expect(safe.score).toBeGreaterThan(flood.score);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreBuildingSuitability({});
    expect(result.score).toBe(50);
  });
});

describe('scoreFirewoodPotential', () => {
  it('scores adequate precip with large acreage as good', () => {
    const result = scoreFirewoodPotential({ annualPrecipIn: 45, avgMaxTempF: 75 }, { acreage: 20 });
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it('scores low precip as poor', () => {
    const result = scoreFirewoodPotential({ annualPrecipIn: 12, avgMaxTempF: 80 }, { acreage: 20 });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('penalizes small acreage (not enough for sustainable harvest)', () => {
    const large = scoreFirewoodPotential({ annualPrecipIn: 40, avgMaxTempF: 70 }, { acreage: 30 });
    const small = scoreFirewoodPotential({ annualPrecipIn: 40, avgMaxTempF: 70 }, { acreage: 2 });
    expect(large.score).toBeGreaterThan(small.score);
  });

  it('returns neutral when data is missing', () => {
    const result = scoreFirewoodPotential({}, {});
    expect(result.score).toBe(50);
  });
});

describe('homesteadScore orchestrator', () => {
  const listing: ListingData = { price: 150000, acreage: 20, latitude: 43.1, longitude: -72.78 };

  const enrichment: EnrichmentData = {
    soilCapabilityClass: 2,
    soilDrainageClass: 'Well drained',
    soilTexture: 'Silt loam',
    floodZone: 'X',
    frostFreeDays: 158,
    annualPrecipIn: 42,
    avgMinTempF: 28,
    avgMaxTempF: 72,
    growingSeasonDays: 165,
    elevationFt: 1200,
    slopePct: 5,
    wetlandType: null,
    wetlandDistanceFt: Infinity,
  };

  const criteria: SearchCriteria = {
    acreage: { min: 5, max: 50 },
    price: { max: 200000 },
    geography: { type: 'radius', center: { lat: 43.0, lng: -72.8 }, radiusMiles: 50 },
  };

  it('returns base scoring result from generic scorer', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    expect(result.base.overallScore).toBeGreaterThan(0);
    expect(result.base.componentScores).toBeDefined();
    expect(result.base.hardFilterFailed).toBe(false);
  });

  it('returns all 7 homestead component scores', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    const components = result.homestead;
    expect(components.gardenViability.score).toBeGreaterThan(0);
    expect(components.growingSeason.score).toBeGreaterThan(0);
    expect(components.waterAvailability.score).toBeGreaterThan(0);
    expect(components.floodSafety.score).toBeGreaterThan(0);
    expect(components.septicFeasibility.score).toBeGreaterThan(0);
    expect(components.buildingSuitability.score).toBeGreaterThan(0);
    expect(components.firewoodPotential.score).toBeGreaterThan(0);
  });

  it('returns composite homestead score in 0-100 range', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    expect(result.homesteadScore).toBeGreaterThanOrEqual(0);
    expect(result.homesteadScore).toBeLessThanOrEqual(100);
  });

  it('every component includes a non-empty label', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    for (const component of Object.values(result.homestead)) {
      expect(typeof component.label).toBe('string');
      expect(component.label.length).toBeGreaterThan(0);
    }
  });

  it('custom weights shift the composite score', () => {
    // Use mixed-quality enrichment so components diverge
    const mixedEnrichment: EnrichmentData = {
      soilCapabilityClass: 1,
      soilDrainageClass: 'Well drained',
      soilTexture: 'Silt loam',
      floodZone: 'AE', // poor flood safety
      frostFreeDays: 80, // short growing season
      annualPrecipIn: 42,
      avgMinTempF: 5,
      avgMaxTempF: 65,
      elevationFt: 150,
      slopePct: 3,
      wetlandType: null,
      wetlandDistanceFt: Infinity,
    };
    const defaultResult = homesteadScore(listing, mixedEnrichment, criteria);
    const gardenHeavy = homesteadScore(listing, mixedEnrichment, criteria, {
      gardenViability: 10,
      floodSafety: 0.1,
    });
    // Garden is excellent but flood is poor — heavy garden weight should raise score
    expect(gardenHeavy.homesteadScore).toBeGreaterThan(defaultResult.homesteadScore);
  });

  it('returns zero homestead score when base hard filter fails', () => {
    const strictCriteria: SearchCriteria = {
      floodZoneExclude: ['X'], // This listing is in Zone X — hard reject
    };
    const result = homesteadScore(listing, enrichment, strictCriteria);
    expect(result.base.hardFilterFailed).toBe(true);
    expect(result.homesteadScore).toBe(0);
  });
});
