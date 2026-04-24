/**
 * Download NWI (National Wetlands Inventory) state geodatabases from FWS.
 *
 * Downloads one geodatabase ZIP per state for the specified region.
 * Only the geodatabase format is available — the shapefile variant returns 403.
 *
 * Source: https://www.fws.gov/program/national-wetlands-inventory/download-state-wetlands-data
 *
 * Usage: pnpm --filter @landmatch/geodata download:wetlands [--region northeast]
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { curlDownload } from '../src/lib/download';
import { parseArg } from '../src/cli';
import { STATES_BY_REGION } from '../src/sources/wetlands';

const DATA_DIR = join(import.meta.dirname, '../data/wetlands');
const BASE_URL = 'https://documentst.ecosphere.fws.gov/wetlands/data/State-Downloads';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const regionName = parseArg(args, '--region') ?? 'northeast';

  const states = STATES_BY_REGION[regionName];
  if (!states) {
    console.error(`Unknown region: ${regionName}. Available: ${Object.keys(STATES_BY_REGION).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;

  console.log(`[wetlands] Downloading NWI geodatabases for ${regionName} (${states.length} states)...`);
  for (const state of states) {
    const file = `${state}_geodatabase_wetlands.zip`;
    const dest = join(DATA_DIR, file);
    if (existsSync(dest)) {
      console.log(`  skip ${file} (exists)`);
      skipped++;
      continue;
    }
    curlDownload(`${BASE_URL}/${file}`, dest);
    downloaded++;
  }

  console.log(`\n[wetlands] Done. ${downloaded} downloaded, ${skipped} already existed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
