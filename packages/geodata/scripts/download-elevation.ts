/**
 * Download USGS 3DEP elevation data via ArcGIS Image Server REST API.
 *
 * Fetches 2-degree tiles and mosaics them into a single GeoTIFF.
 * The load command also does this on-demand, but this script lets you
 * pre-fetch the data independently.
 *
 * Source: https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
 *
 * Usage: pnpm --filter @landmatch/geodata download:elevation [--region northeast]
 */

import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../src/types';
import { parseArg } from '../src/cli';
import { ELEVATION_REST_URL, TILE_DEG, TILE_PX } from '../src/sources/elevation';
import { runShell } from '../src/lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../data/elevation');

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const regionName = parseArg(args, '--region') ?? 'northeast';

  const region = REGIONS[regionName];
  if (!region) {
    console.error(`Unknown region: ${regionName}. Available: ${Object.keys(REGIONS).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const outputPath = join(DATA_DIR, `elevation_${regionName}.tif`);
  if (existsSync(outputPath)) {
    console.log(`[elevation] ${outputPath} already exists, skipping.`);
    return;
  }

  console.log(`[elevation] Fetching 3DEP elevation for ${region.name} via tiled REST API...`);

  const tilePaths: string[] = [];
  let tileNum = 0;
  const totalCols = Math.ceil((region.maxLng - region.minLng) / TILE_DEG);
  const totalRows = Math.ceil((region.maxLat - region.minLat) / TILE_DEG);
  const totalTiles = totalCols * totalRows;

  for (let lng = region.minLng; lng < region.maxLng; lng += TILE_DEG) {
    for (let lat = region.minLat; lat < region.maxLat; lat += TILE_DEG) {
      tileNum++;
      const tileMaxLng = Math.min(lng + TILE_DEG, region.maxLng);
      const tileMaxLat = Math.min(lat + TILE_DEG, region.maxLat);
      const bbox = `${lng},${lat},${tileMaxLng},${tileMaxLat}`;
      const tilePath = join(DATA_DIR, `tile_${lng}_${lat}.tif`);

      if (existsSync(tilePath)) {
        console.log(`[elevation] tile ${tileNum}/${totalTiles}: skip (exists)`);
        tilePaths.push(tilePath);
        continue;
      }

      console.log(`[elevation] tile ${tileNum}/${totalTiles}: ${bbox}`);
      runShell([
        'gdalwarp',
        `"/vsicurl/${ELEVATION_REST_URL}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${TILE_PX},${TILE_PX}&format=tiff&f=image"`,
        `"${tilePath}"`,
        '-overwrite',
      ].join(' '));
      tilePaths.push(tilePath);
    }
  }

  console.log(`[elevation] Mosaicking ${tilePaths.length} tiles...`);
  const tileList = tilePaths.map((p) => `"${p}"`).join(' ');
  runShell(`gdal_merge.py -o "${outputPath}" -of GTiff ${tileList}`);

  for (const p of tilePaths) unlinkSync(p);

  console.log(`[elevation] Done. Saved to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
