import { err, ok } from '@landmatch/api';

import type { EnrichmentAdapter, LatLng, Result, SoilData } from './types';

const SDM_URL = 'https://sdmdataaccess.sc.egov.usda.gov/tabular/post.rest';
const TIMEOUT_MS = 15_000;

const CAPABILITY_SUITABILITY: Record<number, Record<string, number>> = {
  1: { crops: 95, pasture: 95, garden: 95, orchard: 90 },
  2: { crops: 80, pasture: 85, garden: 85, orchard: 80 },
  3: { crops: 60, pasture: 75, garden: 70, orchard: 65 },
  4: { crops: 40, pasture: 65, garden: 55, orchard: 50 },
  5: { crops: 10, pasture: 60, garden: 30, orchard: 20 },
  6: { crops: 5, pasture: 50, garden: 20, orchard: 15 },
  7: { crops: 0, pasture: 30, garden: 10, orchard: 5 },
  8: { crops: 0, pasture: 5, garden: 0, orchard: 0 },
};

function buildSoilQuery(lat: number, lng: number): string {
  return `
    SELECT TOP 1
      c.comppct_r,
      c.nirrcapcl,
      c.drainagecl,
      cht.texcl
    FROM sacatalog AS sc
    INNER JOIN legend AS l ON sc.areasymbol = l.areasymbol
    INNER JOIN mapunit AS mu ON l.lkey = mu.lkey
    INNER JOIN component AS c ON mu.mukey = c.mukey
    LEFT JOIN chorizon AS ch ON c.cokey = ch.cokey
    LEFT JOIN chtexturegrp AS chtg ON ch.chkey = chtg.chkey
    LEFT JOIN chtexture AS cht ON chtg.chtgkey = cht.chtgkey
    WHERE mu.mukey IN (
      SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})')
    )
    AND c.comppct_r IS NOT NULL
    ORDER BY c.comppct_r DESC
  `.trim();
}

export const soilAdapter: EnrichmentAdapter<SoilData> = {
  name: 'usda-soil',

  isAvailable(): boolean {
    return true;
  },

  async enrich(coords: LatLng): Promise<Result<SoilData>> {
    const query = buildSoilQuery(coords.lat, coords.lng);

    try {
      const res = await fetch(SDM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `query=${encodeURIComponent(query)}&format=JSON`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        return err(`USDA SDM HTTP ${res.status}`);
      }

      const json = (await res.json()) as { Table?: unknown[][] };
      const table = json?.Table;

      if (!Array.isArray(table) || table.length === 0) {
        return err('No soil data found for this location');
      }

      const row = table[0];
      const rawCapClass = String(row[1] ?? '');
      const capDigit = parseInt(rawCapClass, 10);
      const capabilityClass = isNaN(capDigit) ? 0 : Math.min(Math.max(capDigit, 1), 8);

      const drainageClass = String(row[2] ?? 'Unknown');
      const texture = String(row[3] ?? 'Unknown');

      const suitabilityRatings = CAPABILITY_SUITABILITY[capabilityClass] ?? {
        crops: 0,
        pasture: 0,
        garden: 0,
        orchard: 0,
      };

      return ok({
        capabilityClass,
        drainageClass,
        texture,
        suitabilityRatings,
      });
    } catch (e) {
      return err(`USDA SDM failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
