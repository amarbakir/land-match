import type { LatLng } from './types';

// Geocoders return lat/lng as strings and the re-enrichment path reads them
// from DB rows — Number(...) can produce NaN, which would otherwise flow into
// vendor queries (e.g. USDA's POINT(NaN NaN)). Validate at the pipeline
// boundary.
export function isValidLatLng({ lat, lng }: LatLng): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
