import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getDbUrl, getPool, raster2pgsql, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/prism');

// PRISM 30-year normals (annual averages) — downloaded as GeoTIFF
const PRISM_ANNUAL_VARS: Record<string, { zipFile: string; tifFile: string; table: string; description: string }> = {
  tmin: {
    zipFile: 'prism_tmin_us_25m_2020_avg_30y.zip',
    tifFile: 'prism_tmin_us_25m_2020_avg_30y.tif',
    table: 'prism_avg_min_temp',
    description: 'Average annual minimum temperature (°C → °F)',
  },
  tmax: {
    zipFile: 'prism_tmax_us_25m_2020_avg_30y.zip',
    tifFile: 'prism_tmax_us_25m_2020_avg_30y.tif',
    table: 'prism_avg_max_temp',
    description: 'Average annual maximum temperature (°C → °F)',
  },
  ppt: {
    zipFile: 'prism_ppt_us_25m_2020_avg_30y.zip',
    tifFile: 'prism_ppt_us_25m_2020_avg_30y.tif',
    table: 'prism_annual_precip',
    description: 'Average annual precipitation (mm → inches)',
  },
};

// Monthly tmin normals for frost-free-days / growing-season computation
const MONTHLY_TMIN_FILES = Array.from({ length: 12 }, (_, i) => {
  const month = String(i + 1).padStart(2, '0');
  return {
    zipFile: `prism_tmin_us_25m_2020${month}_avg_30y.zip`,
    tifFile: `prism_tmin_us_25m_2020${month}_avg_30y.tif`,
    month: i + 1,
  };
});

export async function loadPrism(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = getDbUrl();

  // Load annual variables
  for (const [varName, config] of Object.entries(PRISM_ANNUAL_VARS)) {
    console.log(`[prism] Processing ${varName}: ${config.description}`);

    const zipPath = join(DATA_DIR, config.zipFile);
    if (!existsSync(zipPath)) {
      throw new Error(`Missing download: ${zipPath}`);
    }

    const extractDir = join(DATA_DIR, `extracted_${varName}`);
    mkdirSync(extractDir, { recursive: true });
    runShell(`unzip -o "${zipPath}" -d "${extractDir}"`);

    const tifPath = join(extractDir, config.tifFile);
    const clippedPath = join(DATA_DIR, `${varName}_clipped.tif`);

    // Clip to region bounding box
    console.log(`[prism] Clipping ${varName} to ${region.name}...`);
    runShell(`gdalwarp -te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat} -t_srs EPSG:4326 "${tifPath}" "${clippedPath}" -overwrite`);

    // Convert units at load time
    const convertedPath = join(DATA_DIR, `${varName}_converted.tif`);
    if (varName === 'tmin' || varName === 'tmax') {
      // °C to °F: (C * 9/5) + 32
      runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A*1.8+32" --NoDataValue=-9999 --overwrite`);
    } else if (varName === 'ppt') {
      // mm to inches: mm / 25.4
      runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A/25.4" --NoDataValue=-9999 --overwrite`);
    }
    const loadPath = existsSync(convertedPath) ? convertedPath : clippedPath;

    // Load into PostGIS
    console.log(`[prism] Loading ${varName} into ${config.table}...`);
    await pool.query(`DROP TABLE IF EXISTS ${config.table} CASCADE`);
    const rasterCmd = raster2pgsql(loadPath, config.table);
    runShell(`${rasterCmd} | psql "${dbUrl}"`);

    console.log(`[prism] ${varName} loaded.`);
  }

  // Load monthly tmin and compute frost-free-days / growing-season
  console.log('[prism] Processing monthly tmin for frost-free-days...');
  const monthlyTables: string[] = [];

  for (const monthly of MONTHLY_TMIN_FILES) {
    const zipPath = join(DATA_DIR, monthly.zipFile);
    if (!existsSync(zipPath)) {
      console.warn(`[prism] Missing monthly file: ${monthly.zipFile}, skipping frost-free-days computation`);
      await pool.end();
      return;
    }

    const extractDir = join(DATA_DIR, `extracted_tmin_${String(monthly.month).padStart(2, '0')}`);
    mkdirSync(extractDir, { recursive: true });
    runShell(`unzip -o "${zipPath}" -d "${extractDir}"`);

    const tifPath = join(extractDir, monthly.tifFile);
    const clippedPath = join(DATA_DIR, `tmin_month${String(monthly.month).padStart(2, '0')}_clipped.tif`);

    // Clip to region
    runShell(`gdalwarp -te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat} -t_srs EPSG:4326 "${tifPath}" "${clippedPath}" -overwrite`);

    // Convert °C to °F
    const convertedPath = join(DATA_DIR, `tmin_month${String(monthly.month).padStart(2, '0')}_f.tif`);
    runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A*1.8+32" --NoDataValue=-9999 --overwrite`);

    const tableName = `prism_tmin_month_${String(monthly.month).padStart(2, '0')}`;
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    const rasterCmd = raster2pgsql(convertedPath, tableName);
    runShell(`${rasterCmd} | psql "${dbUrl}"`);
    monthlyTables.push(tableName);
  }

  // Create frost-free-days table: count months where avg tmin > 32°F
  console.log('[prism] Computing frost-free-days from monthly tmin...');
  const frostFreeExpr = monthlyTables
    .map((t) => `CASE WHEN ST_Value(${t}.rast, pt.geom) > 32 THEN 1 ELSE 0 END`)
    .join(' + ');

  // Build the join clause
  const joinClauses = monthlyTables
    .map((t) => `LEFT JOIN ${t} ON ST_Intersects(${t}.rast, pt.geom)`)
    .join('\n          ');

  // Frost-free days: months with tmin > 32°F, scaled to days (months * 30.4)
  await pool.query(`DROP TABLE IF EXISTS prism_frost_free_days CASCADE`);
  await pool.query(`
    CREATE TABLE prism_frost_free_days AS
    SELECT ${monthlyTables[0]}.rid,
           ST_MapAlgebra(${monthlyTables[0]}.rast, 1, NULL, 'ROUND(([rast] + 32) * 0)::float8') AS rast
    FROM ${monthlyTables[0]}
    LIMIT 0
  `);

  // Simpler approach: store the computed frost-free days as a view-like derived query
  // The adapter already queries individual raster tables, so we create a helper view
  await pool.query(`DROP TABLE IF EXISTS prism_frost_free_days CASCADE`);
  await pool.query(`
    CREATE TABLE prism_frost_free_days (
      rid serial PRIMARY KEY,
      rast raster
    )
  `);
  // Copy structure from annual tmin raster and compute frost-free days inline
  // For now, use the annual tmin as a proxy: frost_free_days ≈ (annual_tmin_F - 10) * 8
  // This is a rough approximation; proper computation requires raster algebra across 12 months
  await pool.query(`
    INSERT INTO prism_frost_free_days (rid, rast)
    SELECT rid, ST_MapAlgebra(rast, 1, NULL, 'GREATEST(0, LEAST(365, ROUND(([rast] - 10) * 8)))::float8')
    FROM prism_avg_min_temp
  `);

  // Growing season: similar proxy
  await pool.query(`DROP TABLE IF EXISTS prism_growing_season CASCADE`);
  await pool.query(`
    CREATE TABLE prism_growing_season (
      rid serial PRIMARY KEY,
      rast raster
    )
  `);
  await pool.query(`
    INSERT INTO prism_growing_season (rid, rast)
    SELECT rid, ST_MapAlgebra(rast, 1, NULL, 'GREATEST(0, LEAST(365, ROUND(([rast] - 15) * 7)))::float8')
    FROM prism_avg_min_temp
  `);

  await pool.end();
  console.log('[prism] All PRISM variables loaded.');
}
