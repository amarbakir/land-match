import { err, ok } from '@landmatch/api';
import type { Pool } from 'pg';
import type { ClimateNormalsData, EnrichmentAdapter, LatLng, Result } from './types';

export function createClimateNormalsAdapter(pool: Pool): EnrichmentAdapter<ClimateNormalsData> {
  return {
    name: 'prism-climate-normals',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<ClimateNormalsData>> {
      try {
        const sql = `
          SELECT
            ST_Value(ffd.rast, pt.geom) AS frost_free_days,
            ST_Value(precip.rast, pt.geom) AS annual_precip_in,
            ST_Value(tmin.rast, pt.geom) AS avg_min_temp_f,
            ST_Value(tmax.rast, pt.geom) AS avg_max_temp_f,
            ST_Value(gs.rast, pt.geom) AS growing_season_days
          FROM (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom) pt
          LEFT JOIN prism_frost_free_days ffd ON ST_Intersects(ffd.rast, pt.geom)
          LEFT JOIN prism_annual_precip precip ON ST_Intersects(precip.rast, pt.geom)
          LEFT JOIN prism_avg_min_temp tmin ON ST_Intersects(tmin.rast, pt.geom)
          LEFT JOIN prism_avg_max_temp tmax ON ST_Intersects(tmax.rast, pt.geom)
          LEFT JOIN prism_growing_season gs ON ST_Intersects(gs.rast, pt.geom)
          LIMIT 1
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat]);

        if (rows.length === 0 || rows[0].frost_free_days === null) {
          return err('No climate normals data found for this location');
        }

        const row = rows[0];
        return ok({
          frostFreeDays: Math.round(Number(row.frost_free_days)),
          annualPrecipIn: Math.round(Number(row.annual_precip_in) * 10) / 10,
          avgMinTempF: Math.round(Number(row.avg_min_temp_f) * 10) / 10,
          avgMaxTempF: Math.round(Number(row.avg_max_temp_f) * 10) / 10,
          growingSeasonDays: Math.round(Number(row.growing_season_days)),
        });
      } catch (e) {
        return err(`Climate normals query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
