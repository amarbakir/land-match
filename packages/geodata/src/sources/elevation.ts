import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getDbUrl, getPool, loadRaster, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/elevation');

export async function loadElevation(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = getDbUrl();

  const outputPath = join(DATA_DIR, `elevation_${regionName}.tif`);

  if (!existsSync(outputPath)) {
    // Fetch via USGS 3DEP WCS endpoint
    console.log(`[elevation] Fetching 3DEP elevation for ${region.name} via WCS...`);
    const wcsUrl = 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer';

    runShell([
      'gdalwarp',
      `"WCS:${wcsUrl}?service=WCS&version=1.1.1&request=GetCoverage&identifier=DEP3Elevation&format=GeoTIFF"`,
      `"${outputPath}"`,
      `-te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat}`,
      '-t_srs EPSG:4326',
      '-tr 0.0003 0.0003',
      '-overwrite',
    ].join(' '));
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
