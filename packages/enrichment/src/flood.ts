import { err, ok } from '@landmatch/api';
import { z } from 'zod';

import type { EnrichmentAdapter, FloodData, LatLng, Result } from './types';

const NFHL_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
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

const NfhlErrorResponse = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
  }),
});

const NfhlQueryResponse = z.object({
  features: z.array(z.unknown()),
});

// FLD_ZONE is required: we explicitly request it via outFields, so a feature
// without it is a malformed response, not a zone-less area. Validated only on
// the first feature — the one we consume — so a degenerate polygon later in
// the array can't discard an otherwise usable result.
const NfhlFeature = z.object({
  // Zone is a lookup code (<= 4 chars in practice; 30 leaves headroom), not
  // free text — truncating a malformed value would persist garbage as an
  // authoritative flood-risk assessment, so over-long values fail closed.
  attributes: z.object({ FLD_ZONE: z.string().max(30) }),
});

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

      const json: unknown = await res.json();

      // ArcGIS reports throttling, bad params, and layer-offline as HTTP 200
      // with an {error} body. Treating that as "no flood zone" would persist
      // minimal risk for a floodplain parcel — fail closed instead.
      const errorBody = NfhlErrorResponse.safeParse(json);
      if (errorBody.success) {
        const { code, message } = errorBody.data.error;
        return err(`FEMA NFHL error ${code}: ${message}`);
      }

      const parsed = NfhlQueryResponse.safeParse(json);
      if (!parsed.success) {
        return err('FEMA NFHL unexpected response shape');
      }

      // Zero intersecting polygons means the point has no digital FIRM
      // coverage — FEMA never assessed it. Zone X areas are themselves
      // polygons in the layer, so this must NOT be recorded as zone X
      // (minimal risk); a null zone marks the parcel as unassessed.
      if (parsed.data.features.length === 0) {
        return ok({
          zone: null,
          description: 'Area not mapped by FEMA NFHL',
        });
      }

      const feature = NfhlFeature.safeParse(parsed.data.features[0]);
      if (!feature.success) {
        return err('FEMA NFHL unexpected response shape');
      }

      const zone = feature.data.attributes.FLD_ZONE;
      const description = ZONE_DESCRIPTIONS[zone] ?? `Flood zone ${zone}`;

      return ok({ zone, description });
    } catch (e) {
      return err(`FEMA NFHL failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
