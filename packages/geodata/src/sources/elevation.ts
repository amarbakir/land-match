import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getDbUrl, getPool, loadRaster, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/elevation');

// USGS 3DEP ArcGIS Image Server REST API.
// WCS endpoint (v1.1.1 and v2.0.1) stopped returning valid raster data (April 2026).
const REST_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';

// Server caps at 8000x8000 and times out on large regions, so we tile.
const TILE_DEG = 2; // degrees per tile (2x2 degree tiles work reliably)
const TILE_PX = 2000; // pixels per tile side (~0.001 deg/px ≈ 100m)

export async function loadElevation(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = getDbUrl();

  const outputPath = join(DATA_DIR, `elevation_${regionName}.tif`);

  if (!existsSync(outputPath)) {
    console.log(`[elevation] Fetching 3DEP elevation for ${region.name} via ArcGIS REST...`);

    // Fetch tiles covering the region
    const tilePaths: string[] = [];
    for (let lng = region.minLng; lng < region.maxLng; lng += TILE_DEG) {
      for (let lat = region.minLat; lat < region.maxLat; lat += TILE_DEG) {
        const tileMaxLng = Math.min(lng + TILE_DEG, region.maxLng);
        const tileMaxLat = Math.min(lat + TILE_DEG, region.maxLat);
        const bbox = `${lng},${lat},${tileMaxLng},${tileMaxLat}`;
        const tilePath = join(DATA_DIR, `tile_${lng}_${lat}.tif`);

        console.log(`[elevation]   tile ${bbox}...`);
        runShell([
          'gdalwarp',
          `"/vsicurl/${REST_URL}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${TILE_PX},${TILE_PX}&format=tiff&f=image"`,
          `"${tilePath}"`,
          '-overwrite',
        ].join(' '));
        tilePaths.push(tilePath);
      }
    }

    // Mosaic tiles into a single raster
    console.log(`[elevation] Mosaicking ${tilePaths.length} tiles...`);
    const tileList = tilePaths.map((p) => `"${p}"`).join(' ');
    runShell(`gdal_merge.py -o "${outputPath}" -of GTiff ${tileList}`);

    // Clean up tiles
    for (const p of tilePaths) unlinkSync(p);
  } else {
    console.log('[elevation] Using cached elevation file.');
  }

  console.log('[elevation] Loading into PostGIS...');
  await loadRaster(pool, dbUrl, outputPath, 'usgs_3dep_elevation');

  // Add raster constraints for spatial indexing
  try {
    await pool.query("SELECT AddRasterConstraints('usgs_3dep_elevation'::name, 'rast'::name)");
  } catch (err) {
    console.warn('[elevation] Could not add raster constraints (non-fatal):', (err as Error).message);
  }

  await pool.end();
  console.log('[elevation] 3DEP elevation loaded.');
}
