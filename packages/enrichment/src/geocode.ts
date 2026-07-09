import { err, ok } from '@landmatch/api';

import type { Result } from './types';

export interface GeocodeData {
  lat: number;
  lng: number;
  matchedAddress: string;
}

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 10_000;

// OSM's usage policy requires an identifying UA with contact info — a bare
// product name gets banned by UA/IP, silently killing the geocode fallback.
function userAgent(): string {
  return `LandMatch/1.0 (${process.env.GEOCODER_CONTACT || 'amar.bakir94@gmail.com'})`;
}

// --- Nominatim throttle: OSM policy is max 1 request/second per app. ---
// Promise-chain limiter: concurrent callers queue up and requests are spaced
// at least MIN_INTERVAL apart, process-wide.
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
let nominatimChain: Promise<unknown> = Promise.resolve();
let nominatimLastAt = 0;

function throttledNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimChain.then(async () => {
    const wait = nominatimLastAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nominatimLastAt = Date.now();
    return fn();
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

    const json = (await res.json()) as { result?: { addressMatches?: Array<{ coordinates: { x: number; y: number }; matchedAddress: string }> } };
    const matches = json?.result?.addressMatches;

    if (!Array.isArray(matches) || matches.length === 0) {
      return err('No address matches from Census Geocoder');
    }

    const match = matches[0];
    const coords = match.coordinates;

    return ok({
      lat: coords.y,
      lng: coords.x,
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

    const json = await res.json();

    if (!Array.isArray(json) || json.length === 0) {
      return err('No results from Nominatim');
    }

    const result = json[0];

    return ok({
      lat: Number(result.lat),
      lng: Number(result.lon),
      matchedAddress: result.display_name,
    });
  } catch (e) {
    return err(`Nominatim failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
