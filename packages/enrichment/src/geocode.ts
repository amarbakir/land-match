import { err, ok } from '@landmatch/api';

import type { Result } from './types';

export interface GeocodeData {
  lat: number;
  lng: number;
  matchedAddress: string;
}

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/addresses/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 10_000;

export async function geocode(address: string): Promise<Result<GeocodeData>> {
  const censusResult = await geocodeCensus(address);
  if (censusResult.ok) return censusResult;

  return geocodeNominatim(address);
}

async function geocodeCensus(address: string): Promise<Result<GeocodeData>> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
      headers: { 'User-Agent': 'LandMatch/1.0' },
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
