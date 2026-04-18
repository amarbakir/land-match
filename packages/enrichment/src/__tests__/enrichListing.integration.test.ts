import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { enrichListing } from '../enrichListing';
import { handlers, MOCK_ADDRESS, MOCK_COORDS, overrides } from './msw-handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('enrichListing integration', () => {
  it('returns geocode, soil, and flood data when all APIs succeed', async () => {
    const result = await enrichListing('123 Mountain Rd, Gatlinburg, TN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Geocode
    expect(result.data.geocode.lat).toBe(MOCK_COORDS.lat);
    expect(result.data.geocode.lng).toBe(MOCK_COORDS.lng);
    expect(result.data.geocode.matchedAddress).toBe(MOCK_ADDRESS);

    // Soil — capability class 2 from '2e', with lookup-derived ratings
    const soil = result.data.enrichment.soil;
    expect(soil).toBeDefined();
    expect(soil!.capabilityClass).toBe(2);
    expect(soil!.drainageClass).toBe('Well drained');
    expect(soil!.texture).toBe('Silt loam');
    expect(soil!.suitabilityRatings).toEqual({
      crops: 80,
      pasture: 85,
      garden: 85,
      orchard: 80,
    });

    // Flood
    const flood = result.data.enrichment.flood;
    expect(flood).toBeDefined();
    expect(flood!.zone).toBe('X');

    // No errors, both sources used
    expect(result.data.enrichment.errors).toHaveLength(0);
    expect(result.data.enrichment.sourcesUsed).toContain('usda-soil');
    expect(result.data.enrichment.sourcesUsed).toContain('fema-nfhl');
  });

  it('captures soil error but returns flood when USDA returns 500', async () => {
    server.use(overrides.soilFail);

    const result = await enrichListing('123 Mountain Rd, Gatlinburg, TN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.enrichment.soil).toBeUndefined();
    expect(result.data.enrichment.flood).toBeDefined();
    expect(result.data.enrichment.flood!.zone).toBe('X');

    expect(result.data.enrichment.errors).toHaveLength(1);
    expect(result.data.enrichment.errors[0].source).toBe('usda-soil');
    expect(result.data.enrichment.sourcesUsed).toContain('fema-nfhl');
    expect(result.data.enrichment.sourcesUsed).not.toContain('usda-soil');
  });

  it('captures flood error but returns soil when FEMA returns 500', async () => {
    server.use(overrides.floodFail);

    const result = await enrichListing('123 Mountain Rd, Gatlinburg, TN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.enrichment.flood).toBeUndefined();
    expect(result.data.enrichment.soil).toBeDefined();
    expect(result.data.enrichment.soil!.capabilityClass).toBe(2);

    expect(result.data.enrichment.errors).toHaveLength(1);
    expect(result.data.enrichment.errors[0].source).toBe('fema-nfhl');
    expect(result.data.enrichment.sourcesUsed).toContain('usda-soil');
    expect(result.data.enrichment.sourcesUsed).not.toContain('fema-nfhl');
  });

  it('returns empty enrichment when all adapters fail', async () => {
    server.use(overrides.soilServiceUnavailable, overrides.floodServiceUnavailable);

    const result = await enrichListing('123 Mountain Rd, Gatlinburg, TN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Geocode still works
    expect(result.data.geocode.lat).toBe(MOCK_COORDS.lat);

    // Both adapters failed
    expect(result.data.enrichment.soil).toBeUndefined();
    expect(result.data.enrichment.flood).toBeUndefined();
    expect(result.data.enrichment.errors).toHaveLength(2);
    expect(result.data.enrichment.sourcesUsed).toHaveLength(0);

    const errorSources = result.data.enrichment.errors.map((e) => e.source);
    expect(errorSources).toContain('usda-soil');
    expect(errorSources).toContain('fema-nfhl');
  });

  it('returns error when both geocoders find no results', async () => {
    server.use(overrides.censusNoMatches, overrides.nominatimEmpty);

    const result = await enrichListing('zzz nonexistent place');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('No results from Nominatim');
  });

  it('falls back to Nominatim when Census fails and continues pipeline', async () => {
    server.use(overrides.censusFail);

    const result = await enrichListing('123 Mountain Rd, Gatlinburg, TN');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Geocode came from Nominatim (strings parsed to numbers)
    expect(result.data.geocode.lat).toBe(MOCK_COORDS.lat);
    expect(result.data.geocode.lng).toBe(MOCK_COORDS.lng);
    expect(result.data.geocode.matchedAddress).toBe(MOCK_ADDRESS);

    // Pipeline still ran successfully
    expect(result.data.enrichment.soil).toBeDefined();
    expect(result.data.enrichment.flood).toBeDefined();
    expect(result.data.enrichment.errors).toHaveLength(0);
  });
});
