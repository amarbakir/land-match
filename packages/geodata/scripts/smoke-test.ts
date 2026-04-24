/**
 * Smoke test — queries PostGIS to verify geodata ETL pipeline results.
 * Checks that loaded tables contain spatially-queryable, non-null data.
 *
 * Usage: pnpm --filter @landmatch/geodata smoke-test
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../../apps/server/.env' });

import { Pool } from 'pg';
import { getDbUrl } from '../src/lib/postgis';

// Jamaica, VT — same test point used by enrichment smoke tests.
// Falls within the northeast region and is surrounded by NWI wetlands.
const TEST_COORD = { lat: 43.1, lng: -72.78 };

interface Check {
  name: string;
  run: (pool: Pool) => Promise<void>;
}

/** Query ST_Value for a raster table at the test coordinate. */
async function rasterValueAt(
  pool: Pool,
  table: string,
  lng: number,
  lat: number,
): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT ST_Value(rast, ST_SetSRID(ST_Point($1, $2), 4326)) AS val
     FROM ${table}
     WHERE ST_Intersects(rast, ST_SetSRID(ST_Point($1, $2), 4326))
     LIMIT 1`,
    [lng, lat],
  );
  return rows.length > 0 ? rows[0].val : null;
}

// ─── PRISM annual rasters ────────────────────────────────────────────

const prismAnnualChecks: Check[] = [
  {
    name: 'prism_avg_min_temp: ST_Value returns plausible °F value',
    async run(pool) {
      // Bug this catches: unit conversion skipped (raw °C loaded),
      // or raster not clipped to region (null for NE coordinate).
      const val = await rasterValueAt(pool, 'prism_avg_min_temp', TEST_COORD.lng, TEST_COORD.lat);
      assert(val !== null, 'ST_Value returned null — raster may not cover test coordinate');
      assert(val > 10 && val < 70, `expected 10-70°F, got ${val}`);
      console.log(`    (${val.toFixed(1)}°F)`);
    },
  },
  {
    name: 'prism_avg_max_temp: ST_Value returns plausible °F value, > min temp',
    async run(pool) {
      // Bug this catches: tmin/tmax files swapped, or both loaded from same source.
      const minVal = await rasterValueAt(pool, 'prism_avg_min_temp', TEST_COORD.lng, TEST_COORD.lat);
      const maxVal = await rasterValueAt(pool, 'prism_avg_max_temp', TEST_COORD.lng, TEST_COORD.lat);
      assert(maxVal !== null, 'ST_Value returned null');
      assert(minVal !== null, 'ST_Value returned null for min temp');
      assert(maxVal > 10 && maxVal < 90, `expected 10-90°F, got ${maxVal}`);
      assert(maxVal > minVal, `max temp (${maxVal}) should be > min temp (${minVal})`);
      console.log(`    (${maxVal.toFixed(1)}°F, min was ${minVal.toFixed(1)}°F)`);
    },
  },
  {
    name: 'prism_annual_precip: ST_Value returns plausible inches value',
    async run(pool) {
      // Bug this catches: mm loaded instead of inches (Vermont gets ~1100mm
      // = ~43 inches; raw mm would be outside the plausible inches range).
      const val = await rasterValueAt(pool, 'prism_annual_precip', TEST_COORD.lng, TEST_COORD.lat);
      assert(val !== null, 'ST_Value returned null');
      assert(val > 20 && val < 80, `expected 20-80 inches, got ${val}`);
      console.log(`    (${val.toFixed(1)} inches)`);
    },
  },
];

// ─── PRISM monthly tmin ──────────────────────────────────────────────

const prismMonthlyChecks: Check[] = [
  {
    name: 'prism_tmin_month_01..12: all 12 tables have raster data at test coord',
    async run(pool) {
      // Bug this catches: missing monthly files skipped silently, or
      // wrong table naming convention (e.g., _1 instead of _01).
      const values: number[] = [];
      for (let m = 1; m <= 12; m++) {
        const table = `prism_tmin_month_${String(m).padStart(2, '0')}`;
        const val = await rasterValueAt(pool, table, TEST_COORD.lng, TEST_COORD.lat);
        assert(val !== null, `${table}: ST_Value returned null`);
        values.push(val);
      }
      console.log(`    (Jan: ${values[0].toFixed(1)}°F … Jul: ${values[6].toFixed(1)}°F … Dec: ${values[11].toFixed(1)}°F)`);
    },
  },
  {
    name: 'prism monthly: January tmin < July tmin (seasonal sanity)',
    async run(pool) {
      // Bug this catches: months loaded in wrong order, or unit conversion
      // applied inconsistently so seasonal pattern is inverted.
      const jan = await rasterValueAt(pool, 'prism_tmin_month_01', TEST_COORD.lng, TEST_COORD.lat);
      const jul = await rasterValueAt(pool, 'prism_tmin_month_07', TEST_COORD.lng, TEST_COORD.lat);
      assert(jan !== null, 'null value for January');
      assert(jul !== null, 'null value for July');
      assert(jan < jul, `January (${jan}°F) should be colder than July (${jul}°F)`);
    },
  },
];

// ─── PRISM derived products ──────────────────────────────────────────

const prismDerivedChecks: Check[] = [
  {
    name: 'prism_frost_free_days: value in [0, 365] range',
    async run(pool) {
      // Bug this catches: missing numpy.minimum(365,...) clamp producing
      // values > 365, or missing numpy.maximum(0,...) producing negatives.
      const val = await rasterValueAt(pool, 'prism_frost_free_days', TEST_COORD.lng, TEST_COORD.lat);
      assert(val !== null, 'ST_Value returned null');
      assert(val >= 0 && val <= 365, `expected 0-365, got ${val}`);
      console.log(`    (${val.toFixed(0)} days)`);
    },
  },
  {
    name: 'prism_growing_season: value in [0, 365] and <= frost_free_days',
    async run(pool) {
      // Bug this catches: growing season threshold (40°F) is stricter than
      // frost-free (32°F), so growing_season should always be <= frost_free_days.
      // If inverted, the threshold logic is wrong.
      const frost = await rasterValueAt(pool, 'prism_frost_free_days', TEST_COORD.lng, TEST_COORD.lat);
      const growing = await rasterValueAt(pool, 'prism_growing_season', TEST_COORD.lng, TEST_COORD.lat);
      assert(frost !== null, 'ST_Value returned null for frost-free days');
      assert(growing !== null, 'ST_Value returned null');
      assert(growing >= 0 && growing <= 365, `expected 0-365, got ${growing}`);
      assert(growing <= frost, `growing season (${growing}) should be <= frost-free days (${frost})`);
      console.log(`    (${growing.toFixed(0)} days, frost-free: ${frost.toFixed(0)} days)`);
    },
  },
];

// ─── Elevation ───────────────────────────────────────────────────────

const elevationChecks: Check[] = [
  {
    name: 'usgs_3dep_elevation: ST_Value returns plausible meters for Vermont',
    async run(pool) {
      // Bug this catches: WCS fetch failed silently (empty raster), or
      // raster not clipped to region. Jamaica VT is ~500m elevation;
      // allow 100-1500m for the broader pixel.
      const val = await rasterValueAt(pool, 'usgs_3dep_elevation', TEST_COORD.lng, TEST_COORD.lat);
      assert(val !== null, 'ST_Value returned null — elevation raster may not cover test coordinate');
      assert(val > 100 && val < 1500, `expected 100-1500m, got ${val}`);
      console.log(`    (${val.toFixed(0)}m)`);
    },
  },
];

// ─── NWI Wetlands (existing checks) ─────────────────────────────────

const wetlandsChecks: Check[] = [
  {
    name: 'nwi_wetlands: table has rows',
    async run(pool) {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM nwi_wetlands');
      const count = rows[0].n;
      assert(count > 0, `expected rows, got ${count}`);
      console.log(`    (${count.toLocaleString()} rows)`);
    },
  },
  {
    name: 'nwi_wetlands: spatial query returns features near test coordinate',
    async run(pool) {
      // NWI only covers wetland areas, so use a 1km radius rather than
      // requiring the test point to fall exactly inside a polygon.
      const { rows } = await pool.query(
        `SELECT wetland_type, attribute
         FROM nwi_wetlands
         WHERE ST_DWithin(
           geom::geography,
           ST_SetSRID(ST_Point($1, $2), 4326)::geography,
           1000
         )
         LIMIT 5`,
        [TEST_COORD.lng, TEST_COORD.lat],
      );
      assert(rows.length > 0, 'no wetland features within 1km of test coordinate');
      console.log(`    (${rows.length} features found)`);
    },
  },
  {
    name: 'nwi_wetlands: wetland_type and attribute columns are populated',
    async run(pool) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS total,
                count(wetland_type)::int AS has_type,
                count(attribute)::int AS has_attr
         FROM nwi_wetlands
         LIMIT 1`,
      );
      const { total, has_type, has_attr } = rows[0];
      assert(has_type > 0, `wetland_type is all nulls (${has_type}/${total})`);
      assert(has_attr > 0, `attribute is all nulls (${has_attr}/${total})`);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────

const checks: Check[] = [
  ...prismAnnualChecks,
  ...prismMonthlyChecks,
  ...prismDerivedChecks,
  ...elevationChecks,
  ...wetlandsChecks,
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const pool = new Pool({ connectionString: getDbUrl() });

  console.log(`Smoke-testing geodata ETL results (test coord: ${TEST_COORD.lat}, ${TEST_COORD.lng})\n`);

  let failures = 0;

  for (const check of checks) {
    try {
      await check.run(pool);
      console.log(`  \u2713 ${check.name}`);
    } catch (e) {
      failures++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  \u2717 ${check.name} \u2014 ${msg}`);
    }
  }

  console.log(`\n${checks.length - failures}/${checks.length} passed`);

  await pool.end();

  if (failures > 0) process.exit(1);
}

main();
