import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { geocode, resetGeocoderForTests } from '../geocode';

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
  resetGeocoderForTests();
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

  it('sends a User-Agent with contact info to Nominatim (OSM policy)', async () => {
    // Bug this catches: OSM's usage policy requires an identifying UA with
    // contact info — 'LandMatch/1.0' alone gets the app banned by UA/IP,
    // silently killing the geocode fallback.
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    await geocode('123 Main St');

    const options = fetchSpy.mock.calls[1][1] as RequestInit;
    const ua = (options.headers as Record<string, string>)['User-Agent'];
    expect(ua).toMatch(/^LandMatch\/1\.0 \(.+@.+\)$/);
  });

  it('honors GEOCODER_CONTACT for the User-Agent contact info', async () => {
    vi.stubEnv('GEOCODER_CONTACT', 'ops@landmatch.example');
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json(NOMINATIM_RESPONSE));

    await geocode('123 Main St');

    const options = fetchSpy.mock.calls[1][1] as RequestInit;
    expect((options.headers as Record<string, string>)['User-Agent']).toBe('LandMatch/1.0 (ops@landmatch.example)');
    vi.unstubAllEnvs();
  });

  it('identifies itself to the Census geocoder too', async () => {
    fetchSpy.mockResolvedValueOnce(Response.json(CENSUS_RESPONSE));

    await geocode('123 Main St');

    const options = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>)['User-Agent']).toMatch(/^LandMatch\/1\.0/);
  });

  it('serves repeat lookups of the same (normalized) address from cache', async () => {
    // Bug this catches: the same listing address re-enriched or re-submitted
    // re-hits the geocoders every time, burning Nominatim quota for nothing.
    fetchSpy.mockResolvedValue(Response.json(CENSUS_RESPONSE));

    const first = await geocode('123 Main St, Springfield MO');
    const second = await geocode('  123 main st,   Springfield mo ');

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    fetchSpy
      .mockResolvedValueOnce(Response.json({ result: { addressMatches: [] } }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json(CENSUS_RESPONSE));

    const miss = await geocode('999 Nowhere Ln');
    const hit = await geocode('999 Nowhere Ln');

    expect(miss.ok).toBe(false);
    expect(hit.ok).toBe(true);
  });

  it('fails fast when the Nominatim queue is saturated instead of queueing unbounded', async () => {
    // Bug this catches: the 1 req/s throttle serializes a fallback that runs
    // inside the user-facing save request — with an unbounded queue the Nth
    // concurrent caller waits N seconds and times out at the gateway. Beyond
    // the cap, callers must get an immediate error they can surface.
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      if (String(input).includes('nominatim')) {
        await new Promise((r) => setTimeout(r, 30));
        return Response.json(NOMINATIM_RESPONSE);
      }
      return Response.json({ result: { addressMatches: [] } });
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => geocode(`${i} Distinct St`)),
    );

    const failed = results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    for (const f of failed) {
      if (!f.ok) expect(f.error).toContain('geocoder busy');
    }
    // The saturated callers failed without consuming Nominatim quota
    const nominatimCalls = fetchSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('nominatim'));
    expect(nominatimCalls.length).toBeLessThan(8);
  }, 15_000);

  it('never issues overlapping Nominatim requests and spaces them ~1s apart', async () => {
    // Bug this catches: 20 parallel enriches = 20 simultaneous Nominatim
    // hits — OSM's policy is max 1 req/s and violators get banned.
    let inFlight = 0;
    let maxInFlight = 0;
    const startedAt: number[] = [];

    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      if (String(input).includes('nominatim')) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        startedAt.push(Date.now());
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return Response.json(NOMINATIM_RESPONSE);
      }
      return Response.json({ result: { addressMatches: [] } });
    });

    await Promise.all([geocode('1 First St'), geocode('2 Second St')]);

    expect(maxInFlight).toBe(1);
    expect(startedAt).toHaveLength(2);
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(1000);
  }, 10_000);

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
    expect(String(fetchSpy.mock.calls[0][0])).toContain('geocoding.geo.census.gov');
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
