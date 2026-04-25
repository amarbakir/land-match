/**
 * PostGIS adapter smoke test — queries the three PostGIS enrichment adapters
 * against real loaded data at a known coordinate to verify the full query path.
 *
 * Requires: PostGIS database with ETL data loaded (see packages/geodata).
 *
 * Usage: pnpm --filter @landmatch/enrichment smoke-test:postgis
 *
 * Env: DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5432/landmatch)
 */

import pg from 'pg';
import {
  createClimateNormalsAdapter,
  createElevationAdapter,
  createWetlandsAdapter,
} from '../src/index';

const TEST_COORD = { lat: 43.1, lng: -72.78 }; // Jamaica, VT

interface Check {
  name: string;
  run: () => Promise<void>;
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertRange(value: number, min: number, max: number, label: string): void {
  assert(
    value >= min && value <= max,
    `${label}: ${value} outside expected range [${min}, ${max}]`,
  );
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/landmatch';

  const pool = new pg.Pool({ connectionString: databaseUrl });

  // Verify connectivity before running checks
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Cannot connect to PostGIS database: ${msg}`);
    process.exit(1);
  }

  const checks: Check[] = [
    {
      name: 'Climate Normals (PRISM)',
      async run() {
        const adapter = createClimateNormalsAdapter(pool);
        assert(adapter.isAvailable(), 'Adapter reports not available');

        const result = await adapter.enrich(TEST_COORD);
        assert(result.ok, `Adapter returned error: ${!result.ok && result.error}`);
        if (!result.ok) return; // type narrowing

        const d = result.data;
        assert(typeof d.frostFreeDays === 'number', 'frostFreeDays is not a number');
        assert(typeof d.annualPrecipIn === 'number', 'annualPrecipIn is not a number');
        assert(typeof d.avgMinTempF === 'number', 'avgMinTempF is not a number');
        assert(typeof d.avgMaxTempF === 'number', 'avgMaxTempF is not a number');
        assert(typeof d.growingSeasonDays === 'number', 'growingSeasonDays is not a number');

        assertRange(d.frostFreeDays, 100, 200, 'frostFreeDays');
        assertRange(d.annualPrecipIn, 30, 60, 'annualPrecipIn');
        assertRange(d.avgMinTempF, 15, 45, 'avgMinTempF');
        assertRange(d.avgMaxTempF, 45, 85, 'avgMaxTempF');
        assertRange(d.growingSeasonDays, 100, 220, 'growingSeasonDays');
      },
    },
    {
      name: 'Elevation (3DEP)',
      async run() {
        const adapter = createElevationAdapter(pool);
        assert(adapter.isAvailable(), 'Adapter reports not available');

        const result = await adapter.enrich(TEST_COORD);
        assert(result.ok, `Adapter returned error: ${!result.ok && result.error}`);
        if (!result.ok) return;

        const d = result.data;
        assert(typeof d.elevationFt === 'number', 'elevationFt is not a number');
        assert(typeof d.slopePct === 'number', 'slopePct is not a number');

        assertRange(d.elevationFt, 200, 3000, 'elevationFt');
        assertRange(d.slopePct, 0, 100, 'slopePct');
      },
    },
    {
      name: 'Wetlands (NWI)',
      async run() {
        const adapter = createWetlandsAdapter(pool);
        assert(adapter.isAvailable(), 'Adapter reports not available');

        const result = await adapter.enrich(TEST_COORD);
        assert(result.ok, `Adapter returned error: ${!result.ok && result.error}`);
        if (!result.ok) return;

        const d = result.data;
        // Wetlands adapter returns null/Infinity when no wetland within buffer — both are valid
        if (d.wetlandType !== null) {
          assert(typeof d.wetlandType === 'string', 'wetlandType is not a string');
          assert(typeof d.wetlandDescription === 'string', 'wetlandDescription is not a string');
          assert(typeof d.distanceFt === 'number', 'distanceFt is not a number');
          assertRange(d.distanceFt, 0, 1000, 'distanceFt');
        } else {
          assert(d.distanceFt === Infinity, 'distanceFt should be Infinity when no wetland found');
        }
      },
    },
  ];

  console.log(
    `Smoke-testing PostGIS adapters with coord (${TEST_COORD.lat}, ${TEST_COORD.lng})\n`,
  );

  let failures = 0;

  for (const check of checks) {
    try {
      await check.run();
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
