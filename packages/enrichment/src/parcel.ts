import { err } from '@landmatch/api';

import type { EnrichmentAdapter, LatLng, ParcelData, Result } from './types';

export const parcelAdapter: EnrichmentAdapter<ParcelData> = {
  name: 'regrid',

  isAvailable(): boolean {
    return process.env.ENABLE_PARCEL_DATA === 'true';
  },

  async enrich(_coords: LatLng): Promise<Result<ParcelData>> {
    // TODO: Implement Regrid API call
    // https://regrid.com/api
    return err('Regrid adapter not yet implemented');
  },
};
