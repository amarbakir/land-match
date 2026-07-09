import { err, ok } from '@landmatch/api';
import type { Pool } from 'pg';
import { z } from 'zod';

import type { EnrichmentAdapter, LatLng, Result, WetlandsData } from './types';
import { boundedString, pgNumeric } from './validate';

const BUFFER_FT = 1000;

// NWI attribute strings are ETL'd vendor text — cap before storage.
const WetlandRow = z.object({
  wetland_type: boundedString(100).nullable(),
  attribute: boundedString(500).nullable(),
  distance_ft: pgNumeric,
});

export function createWetlandsAdapter(pool: Pool): EnrichmentAdapter<WetlandsData> {
  return {
    name: 'usfws-nwi-wetlands',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<WetlandsData>> {
      try {
        const sql = `
          SELECT
            w.wetland_type,
            w.attribute,
            ROUND(ST_Distance(
              w.geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) * 3.28084)::integer AS distance_ft
          FROM nwi_wetlands w
          WHERE ST_DWithin(
            w.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 0.3048
          )
          ORDER BY ST_Distance(
            w.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )
          LIMIT 1
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat, BUFFER_FT]);

        if (rows.length === 0) {
          return ok({
            wetlandType: null,
            wetlandDescription: null,
            distanceFt: Infinity,
          });
        }

        const parsed = WetlandRow.safeParse(rows[0]);
        if (!parsed.success) {
          return err('Wetlands row failed validation');
        }

        return ok({
          wetlandType: parsed.data.wetland_type,
          wetlandDescription: parsed.data.attribute,
          distanceFt: parsed.data.distance_ft,
        });
      } catch (e) {
        return err(`Wetlands query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
