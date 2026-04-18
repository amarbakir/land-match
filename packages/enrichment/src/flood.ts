import { err, ok } from '@landmatch/api';

import type { EnrichmentAdapter, FloodData, LatLng, Result } from './types';

const NFHL_URL = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query';
const TIMEOUT_MS = 10_000;

const ZONE_DESCRIPTIONS: Record<string, string> = {
  A: 'High risk — 1% annual chance of flooding, no base flood elevations determined',
  AE: 'High risk — 1% annual chance of flooding, base flood elevations determined',
  AH: 'High risk — shallow flooding, 1-3 feet',
  AO: 'High risk — sheet flow flooding, 1-3 feet',
  AR: 'High risk — temporary increased risk due to levee restoration',
  V: 'High risk — coastal flooding with velocity hazard (wave action)',
  VE: 'High risk — coastal flooding with velocity hazard, base flood elevations determined',
  X: 'Minimal risk — area outside the 1% and 0.2% annual chance floodplains',
  B: 'Moderate risk — area between the 1% and 0.2% annual chance floodplains',
  C: 'Minimal risk — area outside the 0.2% annual chance floodplain',
  D: 'Undetermined risk — possible but undetermined flood hazards',
};

export const floodAdapter: EnrichmentAdapter<FloodData> = {
  name: 'fema-nfhl',

  isAvailable(): boolean {
    return true;
  },

  async enrich(coords: LatLng): Promise<Result<FloodData>> {
    const url = new URL(NFHL_URL);
    url.searchParams.set('geometry', JSON.stringify({ x: coords.lng, y: coords.lat }));
    url.searchParams.set('geometryType', 'esriGeometryPoint');
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    url.searchParams.set('outFields', 'FLD_ZONE,ZONE_SUBTY');
    url.searchParams.set('f', 'json');
    url.searchParams.set('inSR', '4326');

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        return err(`FEMA NFHL HTTP ${res.status}`);
      }

      const json = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> };
      const features = json?.features;

      if (!Array.isArray(features) || features.length === 0) {
        return ok({
          zone: 'X',
          description: 'Area not mapped by FEMA NFHL',
        });
      }

      const zone = String(features[0].attributes?.FLD_ZONE ?? 'X');
      const description = ZONE_DESCRIPTIONS[zone] ?? `Flood zone ${zone}`;

      return ok({ zone, description });
    } catch (e) {
      return err(`FEMA NFHL failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
