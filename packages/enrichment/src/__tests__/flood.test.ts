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

  it('defaults to Zone X with unmapped description when no features returned', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ features: [] }));

    const result = await floodAdapter.enrich({ lat: 40.0, lng: -90.0 });

    expect(result).toEqual({
      ok: true,
      data: {
        zone: 'X',
        description: 'Area not mapped by FEMA NFHL',
      },
    });
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

  it('handles missing FLD_ZONE attribute by defaulting to X', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        features: [{ attributes: {} }],
      }),
    );

    const result = await floodAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.zone).toBe('X');
    }
  });
});
