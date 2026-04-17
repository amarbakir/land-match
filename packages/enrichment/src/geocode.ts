import { err } from '@landmatch/api';

import type { EnrichmentAdapter, LatLng, Result } from './types';

export interface GeocodeData {
  lat: number;
  lng: number;
  matchedAddress: string;
}

export const geocodeAdapter: EnrichmentAdapter<GeocodeData> = {
  name: 'census-geocoder',

  isAvailable(): boolean {
    return true; // Free, always available
  },

  async enrich(_coords: LatLng): Promise<Result<GeocodeData>> {
    // TODO: Implement Census Geocoder API call
    // https://geocoding.geo.census.gov/geocoder/
    return err('Census Geocoder adapter not yet implemented');
  },
};
