import { describe, expect, it } from 'vitest';
import type { EnrichmentResult } from '@landmatch/enrichment';
import { mapEnrichmentResult, mapEnrichmentRow } from '../mapEnrichment';
import type { EnrichmentRow } from '../types';

describe('mapEnrichmentResult', () => {
  it('maps all adapter fields to flat EnrichmentData', () => {
    const result: EnrichmentResult = {
      soil: {
        capabilityClass: 3,
        drainageClass: 'well drained',
        texture: 'loam',
        suitabilityRatings: { cropland: 85 },
      },
      flood: { zone: 'X', description: 'Minimal flood hazard' },
      parcel: {
        zoningCode: 'AG-1',
        zoningDescription: 'Agricultural',
        verifiedAcreage: 40,
        geometry: {},
      },
      climate: {
        fireRiskScore: 15,
        floodRiskScore: 22,
        heatRiskScore: 40,
        droughtRiskScore: 30,
      },
      sourcesUsed: ['usda', 'fema', 'regrid', 'firststreet'],
      errors: [],
    };

    const mapped = mapEnrichmentResult(result);

    expect(mapped).toEqual({
      soilCapabilityClass: 3,
      soilDrainageClass: 'well drained',
      soilTexture: 'loam',
      floodZone: 'X',
      zoningCode: 'AG-1',
      fireRiskScore: 15,
      floodRiskScore: 22,
    });
  });

  it('returns undefined fields when only some adapters succeed', () => {
    const result: EnrichmentResult = {
      soil: {
        capabilityClass: 2,
        drainageClass: 'moderately well drained',
        texture: 'clay loam',
        suitabilityRatings: {},
      },
      sourcesUsed: ['usda'],
      errors: [{ source: 'fema', error: 'timeout' }],
    };

    const mapped = mapEnrichmentResult(result);

    expect(mapped.soilCapabilityClass).toBe(2);
    expect(mapped.soilDrainageClass).toBe('moderately well drained');
    expect(mapped.soilTexture).toBe('clay loam');
    expect(mapped.floodZone).toBeUndefined();
    expect(mapped.zoningCode).toBeUndefined();
    expect(mapped.fireRiskScore).toBeUndefined();
    expect(mapped.floodRiskScore).toBeUndefined();
  });

  it('returns all undefined when no adapters succeeded', () => {
    const result: EnrichmentResult = {
      sourcesUsed: [],
      errors: [
        { source: 'usda', error: 'network error' },
        { source: 'fema', error: 'network error' },
      ],
    };

    const mapped = mapEnrichmentResult(result);

    expect(mapped.soilCapabilityClass).toBeUndefined();
    expect(mapped.soilDrainageClass).toBeUndefined();
    expect(mapped.soilTexture).toBeUndefined();
    expect(mapped.floodZone).toBeUndefined();
    expect(mapped.zoningCode).toBeUndefined();
    expect(mapped.fireRiskScore).toBeUndefined();
    expect(mapped.floodRiskScore).toBeUndefined();
  });

  it('maps climate normals, elevation, and wetlands data', () => {
    const result: EnrichmentResult = {
      soil: { capabilityClass: 2, drainageClass: 'Well drained', texture: 'Silt loam', suitabilityRatings: {} },
      flood: { zone: 'X', description: 'Minimal risk' },
      climateNormals: { frostFreeDays: 158, annualPrecipIn: 42.3, avgMinTempF: 28.1, avgMaxTempF: 72.5, growingSeasonDays: 165 },
      elevation: { elevationFt: 1200, slopePct: 8.2 },
      wetlands: { wetlandType: null, wetlandDescription: null, distanceFt: Infinity },
      sourcesUsed: ['usda-soil', 'fema-nfhl', 'prism-climate-normals', 'usgs-3dep-elevation', 'usfws-nwi-wetlands'],
      errors: [],
    };

    const mapped = mapEnrichmentResult(result);

    expect(mapped.frostFreeDays).toBe(158);
    expect(mapped.annualPrecipIn).toBe(42.3);
    expect(mapped.avgMinTempF).toBe(28.1);
    expect(mapped.avgMaxTempF).toBe(72.5);
    expect(mapped.growingSeasonDays).toBe(165);
    expect(mapped.elevationFt).toBe(1200);
    expect(mapped.slopePct).toBe(8.2);
    expect(mapped.wetlandType).toBeNull();
    expect(mapped.wetlandDistanceFt).toBe(Infinity);
  });

  it('handles missing new enrichment sources gracefully', () => {
    const result: EnrichmentResult = {
      soil: { capabilityClass: 2, drainageClass: 'Well drained', texture: 'Silt loam', suitabilityRatings: {} },
      sourcesUsed: ['usda-soil'],
      errors: [],
    };

    const mapped = mapEnrichmentResult(result);

    expect(mapped.frostFreeDays).toBeUndefined();
    expect(mapped.elevationFt).toBeUndefined();
    expect(mapped.wetlandType).toBeUndefined();
  });

  // infrastructure is not mapped from any adapter yet — verify it stays absent
  it('does not include infrastructure (no adapter produces it)', () => {
    const result: EnrichmentResult = {
      parcel: {
        zoningCode: 'R-1',
        zoningDescription: 'Residential',
        verifiedAcreage: 5,
        geometry: {},
      },
      sourcesUsed: ['regrid'],
      errors: [],
    };

    const mapped = mapEnrichmentResult(result);
    expect(mapped.infrastructure).toBeUndefined();
  });
});

function fullRow(): EnrichmentRow {
  return {
    soilCapabilityClass: 3,
    soilDrainageClass: 'well drained',
    soilTexture: 'loam',
    femaFloodZone: 'X',
    zoningCode: 'AG-1',
    fireRiskScore: 15,
    floodRiskScore: 22,
    frostFreeDays: 158,
    annualPrecipIn: 42.3,
    avgMinTempF: 28.1,
    avgMaxTempF: 72.5,
    growingSeasonDays: 165,
    elevationFt: 1200,
    slopePct: 8.2,
    wetlandType: null,
    wetlandWithinBufferFt: 500,
  };
}

describe('mapEnrichmentRow', () => {
  it('maps all fields and renames femaFloodZone/wetlandWithinBufferFt', () => {
    const row = fullRow();
    const mapped = mapEnrichmentRow(row);

    expect(mapped).toEqual({
      soilCapabilityClass: 3,
      soilDrainageClass: 'well drained',
      soilTexture: 'loam',
      floodZone: 'X',
      zoningCode: 'AG-1',
      fireRiskScore: 15,
      floodRiskScore: 22,
      frostFreeDays: 158,
      annualPrecipIn: 42.3,
      avgMinTempF: 28.1,
      avgMaxTempF: 72.5,
      growingSeasonDays: 165,
      elevationFt: 1200,
      slopePct: 8.2,
      wetlandType: null,
      wetlandDistanceFt: 500,
    });
  });

  it('converts null fields to undefined', () => {
    const row: EnrichmentRow = {
      ...fullRow(),
      soilDrainageClass: null,
      soilTexture: null,
      femaFloodZone: null,
      frostFreeDays: null,
    };

    const mapped = mapEnrichmentRow(row);

    expect(mapped.soilDrainageClass).toBeUndefined();
    expect(mapped.soilTexture).toBeUndefined();
    expect(mapped.floodZone).toBeUndefined();
    expect(mapped.frostFreeDays).toBeUndefined();
    // non-null fields still mapped
    expect(mapped.soilCapabilityClass).toBe(3);
    expect(mapped.zoningCode).toBe('AG-1');
  });

  it('returns empty object for null input', () => {
    expect(mapEnrichmentRow(null)).toEqual({});
  });

  it('returns empty object for undefined input', () => {
    expect(mapEnrichmentRow(undefined)).toEqual({});
  });

  it('preserves null for wetlandType (checked, no wetland)', () => {
    const row = fullRow(); // wetlandType is null
    const mapped = mapEnrichmentRow(row);

    // null means "checked, no wetland" — distinct from undefined ("not checked")
    expect(mapped.wetlandType).toBeNull();
    expect('wetlandType' in mapped).toBe(true);
  });

  it('does not coerce zero to undefined', () => {
    const row: EnrichmentRow = {
      ...fullRow(),
      fireRiskScore: 0,
      floodRiskScore: 0,
      slopePct: 0,
      soilCapabilityClass: 0,
    };

    const mapped = mapEnrichmentRow(row);

    expect(mapped.fireRiskScore).toBe(0);
    expect(mapped.floodRiskScore).toBe(0);
    expect(mapped.slopePct).toBe(0);
    expect(mapped.soilCapabilityClass).toBe(0);
  });

  it('does not coerce empty string to undefined', () => {
    const row: EnrichmentRow = {
      ...fullRow(),
      femaFloodZone: '',
      zoningCode: '',
    };

    const mapped = mapEnrichmentRow(row);

    expect(mapped.floodZone).toBe('');
    expect(mapped.zoningCode).toBe('');
  });

  it('does not include infrastructure (no DB column)', () => {
    const mapped = mapEnrichmentRow(fullRow());
    expect(mapped.infrastructure).toBeUndefined();
  });
});
