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

const checks: Check[] = [
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

function assert(condition: unknown, message: string): void {
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
