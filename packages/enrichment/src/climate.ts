import { err } from '@landmatch/config';

import type { ClimateData, EnrichmentAdapter, LatLng, Result } from './types';

export const climateAdapter: EnrichmentAdapter<ClimateData> = {
  name: 'first-street',

  isAvailable(): boolean {
    return process.env.ENABLE_CLIMATE_RISK === 'true';
  },

  async enrich(_coords: LatLng): Promise<Result<ClimateData>> {
    // TODO: Implement First Street Foundation API call
    return err('First Street adapter not yet implemented');
  },
};
