import { err } from '@landmatch/api';

import type { EnrichmentAdapter, FloodData, LatLng, Result } from './types';

export const floodAdapter: EnrichmentAdapter<FloodData> = {
  name: 'fema-nfhl',

  isAvailable(): boolean {
    return true; // Free FEMA API, always available
  },

  async enrich(_coords: LatLng): Promise<Result<FloodData>> {
    // TODO: Implement FEMA NFHL ArcGIS REST service call
    // https://hazards.fema.gov/gis/nfhl/rest/services/
    return err('FEMA NFHL adapter not yet implemented');
  },
};
