import { execSync } from 'node:child_process';
import { isLocalHost, parseDatabaseUrl, poolConfig } from '@landmatch/db';
import { Pool } from 'pg';
import type { RegionBounds } from '../types';

export function getDbUrl(): string {
  return process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';
}

export function getPool(): Pool {
  // Shared TLS policy from @landmatch/db — a raw connectionString would use
  // pg-native URL semantics (plaintext without sslmode) against the same
  // database the server connects to with verified TLS.
  return new Pool(poolConfig(getDbUrl(), (w) => console.warn(`[geodata] ${w}`)));
}

/**
 * Guard a URL that gets handed to the psql CLI (raster loading). psql uses
 * libpq semantics — sslmode=prefer by default, and even sslmode=require does
 * NOT verify the server cert — so remote loads must pin verify-full
 * explicitly (with PGSSLROOTCERT when the provider CA isn't public).
 */
export function psqlSafeUrl(url: string): string {
  const { host, sslmode } = parseDatabaseUrl(url);
  if (isLocalHost(host)) return url;

  if (sslmode !== 'verify-full') {
    throw new Error(
      `refusing to hand psql a remote database URL without sslmode=verify-full (host: ${host}); ` +
        'append ?sslmode=verify-full and set PGSSLROOTCERT if the provider CA is not publicly trusted',
    );
  }
  return url;
}

export async function ensurePostGIS(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis_raster');
  console.log('[geodata] PostGIS extensions enabled');
}

export function raster2pgsql(inputFile: string, tableName: string, srid: number = 4326): string {
  return `raster2pgsql -s ${srid} -I -C -M -t 100x100 "${inputFile}" ${tableName}`;
}

export function runShell(cmd: string): void {
  console.log(`[geodata] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

export function clipToRegion(inputPath: string, outputPath: string, region: RegionBounds): void {
  runShell(`gdalwarp -te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat} -t_srs EPSG:4326 "${inputPath}" "${outputPath}" -overwrite`);
}

export async function loadRaster(pool: Pool, dbUrl: string, filePath: string, tableName: string): Promise<void> {
  const safeUrl = psqlSafeUrl(dbUrl);
  await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  runShell(`${raster2pgsql(filePath, tableName)} | psql "${safeUrl}"`);
}
