import { err, ok } from '@landmatch/api';
import { z } from 'zod';

import { isValidLatLng } from './coords';
import type { Result } from './types';
import { boundedString } from './validate';

export interface GeocodeData {
  lat: number;
  lng: number;
  matchedAddress: string;
}

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 10_000;

// Both geocoders' responses are validated, not cast: garbage lat/lng would
// otherwise flow downstream as NaN (into vendor queries and the listings
// table), and display names are unbounded vendor text.
const BoundedAddress = boundedString(500);

const CensusResponse = z.object({
  result: z
    .object({
      addressMatches: z
        .array(
          z.object({
            matchedAddress: BoundedAddress,
            coordinates: z.object({ x: z.number(), y: z.number() }),
          }),
        )
        .optional(),
    })
    .optional(),
});

const NominatimResponse = z.array(
  z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    display_name: BoundedAddress,
  }),
);

// OSM's usage policy requires an identifying UA with contact info — a bare
// product name gets banned by UA/IP, silently killing the geocode fallback.
function userAgent(): string {
  return `LandMatch/1.0 (${process.env.GEOCODER_CONTACT || 'amar.bakir94@gmail.com'})`;
}

// --- Nominatim throttle: OSM policy is max 1 request/second per app. ---
// Promise-chain limiter: concurrent callers queue up and requests are spaced
// at least MIN_INTERVAL apart, process-wide. Known limitation: on Lambda each
// container throttles independently, so aggregate rate is (concurrency) req/s
// — acceptable while concurrency is low; a shared limiter is the upgrade path
// if geocode volume grows.
// The queue is capped: this fallback runs inside the user-facing save request,
// so a saturated queue must fail fast (clear error now) rather than hold the
// request past gateway timeouts (opaque error in ~30s).
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
const NOMINATIM_MAX_QUEUED = 3;
let nominatimChain: Promise<unknown> = Promise.resolve();
let nominatimLastAt = 0;
let nominatimQueued = 0;

function throttledNominatim<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  if (nominatimQueued >= NOMINATIM_MAX_QUEUED) {
    return Promise.resolve(err('Nominatim geocoder busy — try again shortly'));
  }
  nominatimQueued++;
  const run = nominatimChain.then(async () => {
    const wait = nominatimLastAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nominatimLastAt = Date.now();
    try {
      return await fn();
    } finally {
      nominatimQueued--;
    }
  });
  nominatimChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Successful geocodes are stable — cache by normalized address so repeat
// enriches of the same listing don't burn geocoder quota. FIFO-capped.
const GEOCODE_CACHE_MAX = 500;
const geocodeCache = new Map<string, GeocodeData>();

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resetGeocoderForTests(): void {
  geocodeCache.clear();
  nominatimChain = Promise.resolve();
  nominatimLastAt = 0;
  nominatimQueued = 0;
}

// Schema-valid coordinates can still be out of range (e.g. lat/lng swapped by
// the vendor) — one shared tail keeps both providers' guard and error format
// in sync.
function checkedGeocode(provider: string, data: GeocodeData): Result<GeocodeData> {
  if (!isValidLatLng(data)) {
    return err(`${provider} returned invalid coordinates (${data.lat}, ${data.lng})`);
  }
  return ok(data);
}

export async function geocode(address: string): Promise<Result<GeocodeData>> {
  const cacheKey = normalizeAddress(address);
  const cached = geocodeCache.get(cacheKey);
  if (cached) return ok(cached);

  const censusResult = await geocodeCensus(address);
  const result = censusResult.ok ? censusResult : await throttledNominatim(() => geocodeNominatim(address));

  if (result.ok) {
    if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
      geocodeCache.delete(geocodeCache.keys().next().value as string);
    }
    geocodeCache.set(cacheKey, result.data);
  }

  return result;
}

async function geocodeCensus(address: string): Promise<Result<GeocodeData>> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': userAgent() },
    });

    if (!res.ok) {
      return err(`Census Geocoder HTTP ${res.status}`);
    }

    const parsed = CensusResponse.safeParse(await res.json());
    if (!parsed.success) {
      return err('Census Geocoder unexpected response shape');
    }
    const matches = parsed.data.result?.addressMatches;

    if (!matches || matches.length === 0) {
      return err('No address matches from Census Geocoder');
    }

    const match = matches[0];
    return checkedGeocode('Census Geocoder', {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matchedAddress: match.matchedAddress,
    });
  } catch (e) {
    return err(`Census Geocoder failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function geocodeNominatim(address: string): Promise<Result<GeocodeData>> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': userAgent() },
    });

    if (!res.ok) {
      return err(`Nominatim HTTP ${res.status}`);
    }

    const parsed = NominatimResponse.safeParse(await res.json());
    if (!parsed.success) {
      return err('Nominatim unexpected response shape');
    }
    if (parsed.data.length === 0) {
      return err('No results from Nominatim');
    }

    const result = parsed.data[0];
    return checkedGeocode('Nominatim', {
      lat: result.lat,
      lng: result.lon,
      matchedAddress: result.display_name,
    });
  } catch (e) {
    return err(`Nominatim failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
