import type { ClimateData, EnrichmentAdapter, LatLng, Result } from './types';

const ENABLE_CLIMATE_RISK = process.env.ENABLE_CLIMATE_RISK === 'true';

export const climateAdapter: EnrichmentAdapter<ClimateData> = {
  name: 'first-street',

  isAvailable(): boolean {
    return ENABLE_CLIMATE_RISK;
  },

  async enrich(coords: LatLng): Promise<Result<ClimateData>> {
    if (!this.isAvailable()) {
      return { ok: false, error: 'Climate risk disabled (ENABLE_CLIMATE_RISK)' };
    }
    // TODO: Implement First Street Foundation API call
    return {
      ok: false,
      error: 'First Street adapter not yet implemented',
    };
  },
};
