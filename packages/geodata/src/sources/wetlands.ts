import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getDbUrl, getPool, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/wetlands');

// Only northeast is supported currently; expand this map for other regions
const STATES_BY_REGION: Record<string, string[]> = {
  northeast: ['CT', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT', 'VA', 'WV'],
};

export async function loadWetlands(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = getDbUrl();
  const states = STATES_BY_REGION[regionName];
  if (!states) throw new Error(`No state list for region: ${regionName}`);

  // Drop existing table (we'll append state by state)
  await pool.query('DROP TABLE IF EXISTS nwi_wetlands CASCADE');

  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    console.log(`[wetlands] Processing ${state} (${i + 1}/${states.length})...`);

    const zipPath = join(DATA_DIR, `${state}_geodatabase_wetlands.zip`);
    if (!existsSync(zipPath)) {
      console.warn(`[wetlands] Missing download: ${zipPath}, skipping`);
      continue;
    }

    const extractDir = join(DATA_DIR, state);
    mkdirSync(extractDir, { recursive: true });
    runShell(`unzip -o "${zipPath}" -d "${extractDir}"`);

    // Geodatabase path
    const gdbPath = join(extractDir, `${state}_geodatabase_wetlands.gdb`);
    if (!existsSync(gdbPath)) {
      console.warn(`[wetlands] GDB not found at ${gdbPath}, skipping`);
      continue;
    }

    // Load into PostGIS using ogr2ogr (append mode after first state)
    const appendFlag = i === 0 ? '-overwrite' : '-append';

    // NWI geodatabases contain multiple layers; the wetlands polygons
    // live in the "{STATE}_Wetlands" layer.
    const layerName = `${state}_Wetlands`;

    // -select is incompatible with -append in ogr2ogr, so use -sql for
    // field selection which works in both overwrite and append modes.
    runShell([
      'ogr2ogr -f "PostgreSQL"',
      `"PG:${dbUrl}"`,
      `"${gdbPath}"`,
      '-nln nwi_wetlands',
      '-nlt PROMOTE_TO_MULTI',
      '-lco GEOMETRY_NAME=geom',
      '-t_srs EPSG:4326',
      appendFlag,
      `-sql "SELECT WETLAND_TYPE, ATTRIBUTE FROM ${layerName}"`,
    ].join(' '));
  }

  // Create spatial indexes
  console.log('[wetlands] Creating spatial indexes...');
  await pool.query('CREATE INDEX IF NOT EXISTS nwi_wetlands_geom_idx ON nwi_wetlands USING GIST (geom)');
  await pool.query('CREATE INDEX IF NOT EXISTS nwi_wetlands_geog_idx ON nwi_wetlands USING GIST ((geom::geography))');

  await pool.end();
  console.log('[wetlands] NWI wetlands loaded.');
}
