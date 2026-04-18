import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GeocodeData } from '../geocode';
import type { EnrichmentResult } from '../types';

vi.mock('../geocode');
vi.mock('../pipeline');

import { geocode } from '../geocode';
import { runEnrichmentPipeline } from '../pipeline';
import { enrichListing } from '../enrichListing';

const mockedGeocode = vi.mocked(geocode);
const mockedPipeline = vi.mocked(runEnrichmentPipeline);

const GEOCODE_DATA: GeocodeData = {
  lat: 37.215,
  lng: -93.298,
  matchedAddress: '123 MAIN ST, SPRINGFIELD, MO, 65801',
};

const PIPELINE_RESULT: EnrichmentResult = {
  sourcesUsed: ['USDA Soil Data Access', 'FEMA NFHL'],
  errors: [],
  soil: { capabilityClass: 2, drainageClass: 'Well drained', texture: 'Silt loam', suitabilityRatings: {} },
  flood: { zone: 'X', description: 'Minimal flood hazard' },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('enrichListing', () => {
  it('passes geocoded coordinates to the pipeline and returns combined result', async () => {
    mockedGeocode.mockResolvedValue({ ok: true, data: GEOCODE_DATA });
    mockedPipeline.mockResolvedValue(PIPELINE_RESULT);

    const result = await enrichListing('123 Main St, Springfield, MO');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok result');

    // Verify pipeline received the exact coords from geocode — not hardcoded or swapped
    expect(mockedPipeline).toHaveBeenCalledWith({ lat: 37.215, lng: -93.298 });

    // Verify both fields are present with correct data
    expect(result.data.geocode).toEqual(GEOCODE_DATA);
    expect(result.data.enrichment).toEqual(PIPELINE_RESULT);
  });

  it('returns error and skips pipeline when geocode fails', async () => {
    mockedGeocode.mockResolvedValue({ ok: false, error: 'No address matches from Census Geocoder' });

    const result = await enrichListing('not a real address');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error).toBe('No address matches from Census Geocoder');

    // Pipeline should never run — can't enrich without coordinates
    expect(mockedPipeline).not.toHaveBeenCalled();
  });

  it('passes through pipeline errors in the enrichment result', async () => {
    const partialResult: EnrichmentResult = {
      sourcesUsed: ['USDA Soil Data Access'],
      errors: [
        { source: 'FEMA NFHL', error: 'HTTP 503' },
        { source: 'Regrid', error: 'API key not configured' },
      ],
      soil: { capabilityClass: 3, drainageClass: 'Moderately well drained', texture: 'Clay loam', suitabilityRatings: {} },
    };

    mockedGeocode.mockResolvedValue({ ok: true, data: GEOCODE_DATA });
    mockedPipeline.mockResolvedValue(partialResult);

    const result = await enrichListing('123 Main St, Springfield, MO');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok result');

    // Adapter-level errors are part of the enrichment result, not a top-level failure
    expect(result.data.enrichment.errors).toHaveLength(2);
    expect(result.data.enrichment.sourcesUsed).toEqual(['USDA Soil Data Access']);
    // Geocode data still present even when some adapters fail
    expect(result.data.geocode.matchedAddress).toBe('123 MAIN ST, SPRINGFIELD, MO, 65801');
  });
});
