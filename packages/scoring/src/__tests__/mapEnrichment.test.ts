import { describe, expect, it } from 'vitest';
import type { EnrichmentResult } from '@landmatch/enrichment';
import { mapEnrichmentResult } from '../mapEnrichment';

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
    expect(mapped.floodZone).toBeUndefined();
    expect(mapped.zoningCode).toBeUndefined();
    expect(mapped.fireRiskScore).toBeUndefined();
    expect(mapped.floodRiskScore).toBeUndefined();
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
