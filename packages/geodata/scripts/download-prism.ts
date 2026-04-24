/**
 * Download PRISM 30-year climate normals (1991-2020) from Oregon State.
 *
 * Downloads 15 GeoTIFF ZIPs:
 *   - 3 annual variables: tmin, tmax, ppt
 *   - 12 monthly tmin (for frost-free-days / growing-season derivation)
 *
 * Source: https://prism.oregonstate.edu/normals/
 * Resolution: 4km (2.5 arcmin)
 *
 * Usage: pnpm --filter @landmatch/geodata download:prism
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { curlDownload } from '../src/lib/download';

const DATA_DIR = join(import.meta.dirname, '../data/prism');
const BASE_URL = 'https://data.prism.oregonstate.edu/normals/us/4km';

const ANNUAL_FILES = [
  { variable: 'tmin', file: 'prism_tmin_us_25m_2020_avg_30y.zip' },
  { variable: 'tmax', file: 'prism_tmax_us_25m_2020_avg_30y.zip' },
  { variable: 'ppt', file: 'prism_ppt_us_25m_2020_avg_30y.zip' },
];

const MONTHLY_TMIN_FILES = Array.from({ length: 12 }, (_, i) => {
  const month = String(i + 1).padStart(2, '0');
  return { file: `prism_tmin_us_25m_2020${month}_avg_30y.zip`, month };
});

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;

  // Annual variables
  console.log('[prism] Downloading annual normals...');
  for (const { variable, file } of ANNUAL_FILES) {
    const dest = join(DATA_DIR, file);
    if (existsSync(dest)) {
      console.log(`  skip ${file} (exists)`);
      skipped++;
      continue;
    }
    curlDownload(`${BASE_URL}/${variable}/monthly/${file}`, dest);
    downloaded++;
  }

  // Monthly tmin
  console.log('[prism] Downloading monthly tmin normals...');
  for (const { file } of MONTHLY_TMIN_FILES) {
    const dest = join(DATA_DIR, file);
    if (existsSync(dest)) {
      console.log(`  skip ${file} (exists)`);
      skipped++;
      continue;
    }
    curlDownload(`${BASE_URL}/tmin/monthly/${file}`, dest);
    downloaded++;
  }

  console.log(`\n[prism] Done. ${downloaded} downloaded, ${skipped} already existed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
