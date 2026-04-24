import { execSync } from 'node:child_process';
import { Pool } from 'pg';

export function getDbUrl(): string {
  return process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';
}

export function getPool(): Pool {
  return new Pool({ connectionString: getDbUrl() });
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
