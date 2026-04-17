import type { EnrichmentAdapter, FloodData, LatLng, Result } from './types';

export const floodAdapter: EnrichmentAdapter<FloodData> = {
  name: 'fema-nfhl',

  isAvailable(): boolean {
    return true; // Free FEMA API, always available
  },

  async enrich(coords: LatLng): Promise<Result<FloodData>> {
    // TODO: Implement FEMA NFHL ArcGIS REST service call
    // https://hazards.fema.gov/gis/nfhl/rest/services/
    return {
      ok: false,
      error: 'FEMA NFHL adapter not yet implemented',
    };
  },
};
