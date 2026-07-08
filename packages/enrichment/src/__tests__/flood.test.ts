import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { floodAdapter } from '../flood';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('floodAdapter.enrich', () => {
  it('parses Zone AE from FEMA response with correct description', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        features: [{ attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: 'FLOODWAY' } }],
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.215, lng: -93.298 });

    expect(result).toEqual({
      ok: true,
      data: {
        zone: 'AE',
        description: 'High risk — 1% annual chance of flooding, base flood elevations determined',
      },
    });
  });

  it('returns a null zone (not X) when the point has no FIRM coverage', async () => {
    // Bug this catches: zone X areas are themselves polygons in the NFHL
    // layer, so zero intersecting features means FEMA never assessed the
    // point. Recording it as zone X would show "minimal flood risk" for an
    // unassessed parcel and let it pass floodZoneExclude hard filters.
    fetchSpy.mockResolvedValueOnce(Response.json({ features: [] }));

    const result = await floodAdapter.enrich({ lat: 40.0, lng: -90.0 });

    expect(result).toEqual({
      ok: true,
      data: {
        zone: null,
        description: 'Area not mapped by FEMA NFHL',
      },
    });
  });

  it('uses the first feature even when a later feature in the array is malformed', async () => {
    // Bug this catches: validating FLD_ZONE on every returned polygon would
    // discard a usable zone when a degenerate second polygon (e.g. a FIRM
    // panel-seam artifact with null FLD_ZONE) rides along in the response.
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        features: [
          { attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: null } },
          { attributes: { FLD_ZONE: null } },
        ],
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.zone).toBe('AE');
    }
  });

  it('returns error on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('connection refused');
    }
  });

  it('returns error on HTTP error status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('500');
    }
  });

  it('provides fallback description for unknown zone codes', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        features: [{ attributes: { FLD_ZONE: 'ZZ', ZONE_SUBTY: null } }],
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.zone).toBe('ZZ');
      expect(result.data.description).toBe('Flood zone ZZ');
    }
  });

  it('sends correct geometry and spatial reference in query params', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ features: [] }));

    await floodAdapter.enrich({ lat: 37.215, lng: -93.298 });

    const url = fetchSpy.mock.calls[0][0] as URL;
    const geometry = JSON.parse(url.searchParams.get('geometry')!);
    expect(geometry).toEqual({ x: -93.298, y: 37.215 });
    expect(url.searchParams.get('inSR')).toBe('4326');
    expect(url.searchParams.get('f')).toBe('json');
  });

  it('fails closed when a feature is missing FLD_ZONE', async () => {
    // Bug this catches: defaulting a malformed feature to zone X records
    // "minimal risk" for a parcel whose actual zone we never received.
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        features: [{ attributes: {} }],
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
  });

  it('fails closed on an ArcGIS HTTP-200 error body (throttling/layer offline)', async () => {
    // Bug this catches: ArcGIS reports throttling and layer-offline as HTTP 200
    // with {error}. That body has no features array, so pre-fix code returned
    // zone X = minimal risk — a FEMA hiccup persisted as a passing flood score
    // that bypasses the floodZoneExclude hard filter on floodplain parcels.
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        error: { code: 503, message: 'Service unavailable', details: [] },
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('503');
      expect(result.error).toContain('Service unavailable');
    }
  });

  it('fails closed when the response shape is not an NFHL query result', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ html: '<title>maintenance</title>' }));

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('unexpected response shape');
    }
  });
});
