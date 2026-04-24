import type { Pool } from 'pg';
import type { ElevationData, EnrichmentAdapter, LatLng, Result } from './types';

export function createElevationAdapter(pool: Pool): EnrichmentAdapter<ElevationData> {
  return {
    name: 'usgs-3dep-elevation',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<ElevationData>> {
      try {
        // Query center elevation + compute slope from 4 neighboring points (~30m apart)
        const sql = `
          WITH center AS (
            SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
          ),
          elev AS (
            SELECT
              ST_Value(r.rast, c.geom) * 3.28084 AS center_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0, 0.0003)) * 3.28084 AS north_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0, -0.0003)) * 3.28084 AS south_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0.0003, 0)) * 3.28084 AS east_ft,
              ST_Value(r.rast, ST_Translate(c.geom, -0.0003, 0)) * 3.28084 AS west_ft
            FROM usgs_3dep_elevation r, center c
            WHERE ST_Intersects(r.rast, c.geom)
            LIMIT 1
          )
          SELECT
            ROUND(center_ft::numeric, 1) AS elevation_ft,
            ROUND((DEGREES(ATAN(
              SQRT(
                POW((east_ft - west_ft) / 65.6, 2) +
                POW((north_ft - south_ft) / 65.6, 2)
              )
            )))::numeric, 1) AS slope_pct
          FROM elev
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat]);

        if (rows.length === 0 || rows[0].elevation_ft === null) {
          return { ok: false, error: 'No elevation data found for this location' };
        }

        return {
          ok: true,
          data: {
            elevationFt: Number(rows[0].elevation_ft),
            slopePct: Number(rows[0].slope_pct),
          },
        };
      } catch (err) {
        return { ok: false, error: `Elevation query failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
