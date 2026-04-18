import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { soilAdapter } from '../soil';

const VALID_SDM_RESPONSE = {
  Table: [
    [
      85, // comppct_r
      '2e', // nirrcapcl — capability class 2
      'Well drained', // drainagecl
      'Silt loam', // texdesc
    ],
  ],
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('soilAdapter.enrich', () => {
  it('parses capability class, drainage, and texture from USDA response', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(VALID_SDM_RESPONSE));

    const result = await soilAdapter.enrich({ lat: 37.215, lng: -93.298 });

    expect(result).toEqual({
      ok: true,
      data: {
        capabilityClass: 2,
        drainageClass: 'Well drained',
        texture: 'Silt loam',
        suitabilityRatings: { crops: 80, pasture: 85, garden: 85, orchard: 80 },
      },
    });
  });

  it('sends SQL with correct coordinates in the query body', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(VALID_SDM_RESPONSE));

    await soilAdapter.enrich({ lat: 40.123, lng: -95.456 });

    const body = fetchSpy.mock.calls[0][1]?.body as string;
    const decoded = decodeURIComponent(body.replace('query=', ''));
    expect(decoded).toContain('POINT(-95.456 40.123)');
  });

  it('returns error when Table is empty (no soil data at location)', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ Table: [] }));

    const result = await soilAdapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No soil data');
    }
  });

  it('returns error on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network timeout'));

    const result = await soilAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('network timeout');
    }
  });

  it('returns error on HTTP error status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await soilAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('503');
    }
  });

  it('handles missing capability class by defaulting to 0 suitability', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        Table: [[60, null, 'Poorly drained', 'Clay']],
      }),
    );

    const result = await soilAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.capabilityClass).toBe(0);
      expect(result.data.suitabilityRatings).toEqual({ crops: 0, pasture: 0, garden: 0, orchard: 0 });
    }
  });

  it('handles null drainage and texture fields', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        Table: [[70, '3', null, null]],
      }),
    );

    const result = await soilAdapter.enrich({ lat: 37.0, lng: -93.0 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.drainageClass).toBe('Unknown');
      expect(result.data.texture).toBe('Unknown');
    }
  });

  it('uses POST method with correct content type', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(VALID_SDM_RESPONSE));

    await soilAdapter.enrich({ lat: 37.0, lng: -93.0 });

    const options = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });
});
