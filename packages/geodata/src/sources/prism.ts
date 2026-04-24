import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { clipToRegion, getDbUrl, getPool, loadRaster, runShell } from '../lib/postgis';

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

export function buildMonthlyCalcCmd(opts: {
  monthlyPaths: string[];
  outFile: string;
  threshold: number;
  daysPerMonth?: number;
}): string {
  const { monthlyPaths, outFile, threshold, daysPerMonth = 30.4 } = opts;
  if (monthlyPaths.length === 0) {
    throw new Error('buildMonthlyCalcCmd requires at least one monthly path');
  }

  const inputs: string[] = [];
  const comparisons: string[] = [];
  for (let i = 0; i < monthlyPaths.length; i++) {
    const letter = String.fromCharCode(65 + i);
    inputs.push(`-${letter} "${monthlyPaths[i]}"`);
    comparisons.push(`(${letter}>${threshold})`);
  }

  const calc = `numpy.minimum(365,numpy.maximum(0,numpy.round((${comparisons.join('+')})*${daysPerMonth})))`;

  return `gdal_calc.py ${inputs.join(' ')} --outfile="${outFile}" --calc="${calc}" --NoDataValue=-9999 --overwrite --type=Float32`;
}

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

    console.log(`[prism] Clipping ${varName} to ${region.name}...`);
    clipToRegion(tifPath, clippedPath, region);

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

    console.log(`[prism] Loading ${varName} into ${config.table}...`);
    await loadRaster(pool, dbUrl, loadPath, config.table);

    console.log(`[prism] ${varName} loaded.`);
  }

  // Load monthly tmin and compute frost-free-days / growing-season
  console.log('[prism] Processing monthly tmin for frost-free-days...');
  const monthlyPaths: string[] = [];

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

    clipToRegion(tifPath, clippedPath, region);

    // Convert °C to °F
    const convertedPath = join(DATA_DIR, `tmin_month${String(monthly.month).padStart(2, '0')}_f.tif`);
    runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A*1.8+32" --NoDataValue=-9999 --overwrite`);

    const tableName = `prism_tmin_month_${String(monthly.month).padStart(2, '0')}`;
    await loadRaster(pool, dbUrl, convertedPath, tableName);
    monthlyPaths.push(convertedPath);
  }

  // Compute frost-free-days from monthly tmin (months where avg tmin > 32°F)
  console.log('[prism] Computing frost-free-days from monthly tmin...');
  const frostFreeOutput = join(DATA_DIR, 'frost_free_days.tif');
  runShell(buildMonthlyCalcCmd({ monthlyPaths, outFile: frostFreeOutput, threshold: 32 }));
  await loadRaster(pool, dbUrl, frostFreeOutput, 'prism_frost_free_days');

  // Compute growing-season days from monthly tmin (months where avg tmin > 40°F)
  console.log('[prism] Computing growing-season from monthly tmin...');
  const growingSeasonOutput = join(DATA_DIR, 'growing_season.tif');
  runShell(buildMonthlyCalcCmd({ monthlyPaths, outFile: growingSeasonOutput, threshold: 40 }));
  await loadRaster(pool, dbUrl, growingSeasonOutput, 'prism_growing_season');

  await pool.end();
  console.log('[prism] All PRISM variables loaded.');
}
