import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnrichmentAdapter } from '../types';

// Default adapters are unavailable so tests only exercise registered fakes.
vi.mock('../soil', () => ({ soilAdapter: { name: 'USDA Soil Data Access', enrich: vi.fn(), isAvailable: () => false } }));
vi.mock('../flood', () => ({ floodAdapter: { name: 'FEMA NFHL', enrich: vi.fn(), isAvailable: () => false } }));
vi.mock('../parcel', () => ({ parcelAdapter: { name: 'Regrid', enrich: vi.fn(), isAvailable: () => false } }));
vi.mock('../climate', () => ({ climateAdapter: { name: 'First Street', enrich: vi.fn(), isAvailable: () => false } }));
vi.mock('../geocode');

import { enrichListing } from '../enrichListing';
import { geocode } from '../geocode';
import { setMetricsSink, type EnrichmentMetric } from '../metrics';
import { clearAdditionalAdapters, registerAdapter, runEnrichmentPipeline } from '../pipeline';

const mockedGeocode = vi.mocked(geocode);

const COORDS = { lat: 37.215, lng: -93.298 };

function collectMetrics(): EnrichmentMetric[] {
  const events: EnrichmentMetric[] = [];
  setMetricsSink((m) => events.push(m));
  return events;
}

function fakeAdapter(name: string, enrich: EnrichmentAdapter<unknown>['enrich']): EnrichmentAdapter<unknown> {
  return { name, enrich, isAvailable: () => true };
}

afterEach(() => {
  setMetricsSink(null);
  clearAdditionalAdapters();
  vi.clearAllMocks();
});

describe('pipeline metrics', () => {
  it('emits a latency metric per adapter with success flag', async () => {
    const events = collectMetrics();
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => ({ ok: true, data: { elevationFt: 900, slopePct: 2 } })));

    await runEnrichmentPipeline(COORDS);

    const adapterEvents = events.filter((e) => e.type === 'adapter');
    expect(adapterEvents).toEqual([
      { type: 'adapter', source: 'PostGIS Elevation', ok: true, ms: expect.any(Number) },
    ]);
    expect(adapterEvents[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('marks adapter metrics ok: false when the adapter returns an error result', async () => {
    const events = collectMetrics();
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => ({ ok: false, error: 'HTTP 503' })));

    await runEnrichmentPipeline(COORDS);

    expect(events.filter((e) => e.type === 'adapter')).toEqual([
      { type: 'adapter', source: 'PostGIS Elevation', ok: false, ms: expect.any(Number) },
    ]);
  });

  it('marks adapter metrics ok: false when the adapter throws', async () => {
    const events = collectMetrics();
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => {
      throw new Error('connection reset');
    }));

    await runEnrichmentPipeline(COORDS);

    expect(events.filter((e) => e.type === 'adapter')).toEqual([
      { type: 'adapter', source: 'PostGIS Elevation', ok: false, ms: expect.any(Number) },
    ]);
  });

  it('emits an end-to-end pipeline metric with source and error counts', async () => {
    const events = collectMetrics();
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => ({ ok: true, data: { elevationFt: 900, slopePct: 2 } })));
    registerAdapter('wetlands', fakeAdapter('PostGIS Wetlands', async () => ({ ok: false, error: 'HTTP 503' })));

    await runEnrichmentPipeline(COORDS);

    expect(events.filter((e) => e.type === 'pipeline')).toEqual([
      { type: 'pipeline', ms: expect.any(Number), sourcesUsed: 1, errors: 1 },
    ]);
  });

  it('does not break enrichment when the sink throws', async () => {
    setMetricsSink(() => {
      throw new Error('sink exploded');
    });
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => ({ ok: true, data: { elevationFt: 900, slopePct: 2 } })));

    const result = await runEnrichmentPipeline(COORDS);

    expect(result.sourcesUsed).toEqual(['PostGIS Elevation']);
  });

  it('runs normally with no sink registered', async () => {
    registerAdapter('elevation', fakeAdapter('PostGIS Elevation', async () => ({ ok: true, data: { elevationFt: 900, slopePct: 2 } })));

    const result = await runEnrichmentPipeline(COORDS);

    expect(result.sourcesUsed).toEqual(['PostGIS Elevation']);
  });
});

describe('geocode metrics', () => {
  it('emits a geocode success metric when geocoding succeeds', async () => {
    const events = collectMetrics();
    mockedGeocode.mockResolvedValue({ ok: true, data: { lat: 37.215, lng: -93.298, matchedAddress: '123 MAIN ST' } });

    await enrichListing('123 Main St, Springfield, MO');

    expect(events.filter((e) => e.type === 'geocode')).toEqual([
      { type: 'geocode', ok: true, ms: expect.any(Number) },
    ]);
  });

  it('emits a geocode failure metric when geocoding fails', async () => {
    const events = collectMetrics();
    mockedGeocode.mockResolvedValue({ ok: false, error: 'No address matches from Census Geocoder' });

    await enrichListing('not a real address');

    expect(events.filter((e) => e.type === 'geocode')).toEqual([
      { type: 'geocode', ok: false, ms: expect.any(Number) },
    ]);
  });
});
