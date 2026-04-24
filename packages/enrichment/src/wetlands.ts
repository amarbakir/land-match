import { err, ok } from '@landmatch/api';
import type { Pool } from 'pg';
import type { EnrichmentAdapter, LatLng, Result, WetlandsData } from './types';

const BUFFER_FT = 1000;

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

        return ok({
          wetlandType: rows[0].wetland_type,
          wetlandDescription: rows[0].attribute,
          distanceFt: Number(rows[0].distance_ft),
        });
      } catch (e) {
        return err(`Wetlands query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
