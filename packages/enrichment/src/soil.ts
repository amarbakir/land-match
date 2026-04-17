import { err } from '@landmatch/config';

import type { EnrichmentAdapter, LatLng, Result, SoilData } from './types';

export const soilAdapter: EnrichmentAdapter<SoilData> = {
  name: 'usda-soil',

  isAvailable(): boolean {
    return true; // Free USDA API, always available
  },

  async enrich(_coords: LatLng): Promise<Result<SoilData>> {
    // TODO: Implement USDA Soil Data Access (SDM) API call
    // https://sdmdataaccess.nrcs.usda.gov/
    return err('USDA Soil adapter not yet implemented');
  },
};
