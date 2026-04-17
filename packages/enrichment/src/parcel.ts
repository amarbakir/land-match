import type { EnrichmentAdapter, LatLng, ParcelData, Result } from './types';

const ENABLE_PARCEL_DATA = process.env.ENABLE_PARCEL_DATA === 'true';

export const parcelAdapter: EnrichmentAdapter<ParcelData> = {
  name: 'regrid',

  isAvailable(): boolean {
    return ENABLE_PARCEL_DATA;
  },

  async enrich(coords: LatLng): Promise<Result<ParcelData>> {
    if (!this.isAvailable()) {
      return { ok: false, error: 'Parcel data disabled (ENABLE_PARCEL_DATA)' };
    }
    // TODO: Implement Regrid API call
    // https://regrid.com/api
    return {
      ok: false,
      error: 'Regrid adapter not yet implemented',
    };
  },
};
