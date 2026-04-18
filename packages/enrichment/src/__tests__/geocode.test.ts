import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { geocode } from '../geocode';

const CENSUS_RESPONSE = {
  result: {
    addressMatches: [
      {
        matchedAddress: '123 MAIN ST, SPRINGFIELD, MO, 65801',
        coordinates: { x: -93.298, y: 37.215 },
      },
    ],
  },
};

const NOMINATIM_RESPONSE = [
  {
    lat: '37.215',
    lon: '-93.298',
    display_name: '123 Main St, Springfield, Greene County, Missouri, 65801, United States',
  },
];

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('geocode', () => {
  it('returns lat/lng from Census Geocoder on success', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(CENSUS_RESPONSE));

    const result = await geocode('123 Main St, Springfield MO');

    expect(result).toEqual({
      ok: true,
      data: {
        lat: 37.215,
        lng: -93.298,
        matchedAddress: '123 MAIN ST, SPRINGFIELD, MO, 65801',
      },
    });
  });

  it('falls back to Nominatim when Census returns no matches', async () => {
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    const result = await geocode('123 Main St, Springfield MO');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lat).toBe(37.215);
      expect(result.data.lng).toBe(-93.298);
    }
  });

  it('sends User-Agent header to Nominatim', async () => {
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    await geocode('123 Main St');

    const nominatimCall = fetchSpy.mock.calls[1];
    const options = nominatimCall[1] as RequestInit;
    expect((options.headers as Record<string, string>)['User-Agent']).toBe('LandMatch/1.0');
  });

  it('returns error when both providers fail', async () => {
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json([]));

    const result = await geocode('nonexistent place');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No results from Nominatim');
    }
  });

  it('falls back to Nominatim when Census returns HTTP error', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    const result = await geocode('123 Main St');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.lat).toBe(37.215);
    }
  });

  it('returns error when Census throws network error and Nominatim also fails', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'));

    const result = await geocode('123 Main St');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Nominatim failed');
    }
  });

  it('does not call Nominatim when Census succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(CENSUS_RESPONSE));

    await geocode('123 Main St');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain('geocoding.geo.census.gov');
  });

  it('handles Census response with malformed coordinates gracefully', async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        result: {
          addressMatches: [{ matchedAddress: '123 MAIN ST', coordinates: null }],
        },
      }),
    );
    fetchSpy.mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    // Should fall through to Nominatim since Census parsing will throw
    const result = await geocode('123 Main St');

    // Either it errors on Census and falls back to Nominatim, or returns an error
    // The key behavior: it doesn't crash with an unhandled exception
    if (result.ok) {
      expect(result.data.lat).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }
  });
});
