import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegionBounds } from '../types';

// Mock child_process before importing the module under test.
// We're testing the COMMAND STRING construction, not that execSync works.
const execSyncSpy = vi.fn();
vi.mock('node:child_process', () => ({ execSync: execSyncSpy }));

const { raster2pgsql, clipToRegion } = await import('../lib/postgis');

const NE_REGION: RegionBounds = {
  name: 'Northeast US',
  minLat: 37.0,
  maxLat: 47.5,
  minLng: -80.5,
  maxLng: -66.9,
};

describe('raster2pgsql', () => {
  it('produces correct flags for tiled, indexed, constrained raster loading', () => {
    // Bug this catches: missing -I (no spatial index), -C (no constraints),
    // or -M (raster not registered in raster_columns view) — downstream
    // ST_Value queries silently return null or fail.
    const cmd = raster2pgsql('/data/frost.tif', 'prism_frost_free_days');

    expect(cmd).toContain('-I');
    expect(cmd).toContain('-C');
    expect(cmd).toContain('-M');
    expect(cmd).toContain('-t 100x100');
  });

  it('defaults SRID to 4326 when omitted', () => {
    // Bug this catches: wrong default SRID causes coordinate mismatch —
    // ST_Value at a WGS84 point returns null because raster is registered
    // under a different projection.
    const cmd = raster2pgsql('/data/elev.tif', 'usgs_3dep_elevation');

    expect(cmd).toContain('-s 4326');
  });

  it('uses provided SRID instead of default', () => {
    // Bug this catches: ignoring the srid parameter and always using 4326,
    // which silently reprojects data incorrectly for non-WGS84 sources.
    const cmd = raster2pgsql('/data/nad83.tif', 'custom_table', 3857);

    expect(cmd).toContain('-s 3857');
    expect(cmd).not.toContain('-s 4326');
  });

  it('quotes the file path to handle spaces', () => {
    // Bug this catches: unquoted paths with spaces split into separate
    // arguments, causing raster2pgsql to fail or load the wrong file.
    const cmd = raster2pgsql('/data/my raster file.tif', 'test_table');

    expect(cmd).toContain('"/data/my raster file.tif"');
  });

  it('includes the table name in the command', () => {
    // Bug this catches: hardcoded or wrong table name causes data to be
    // loaded into the wrong table, overwriting existing data.
    const cmd = raster2pgsql('/data/test.tif', 'prism_annual_precip');

    expect(cmd).toContain('prism_annual_precip');
  });
});

describe('clipToRegion', () => {
  beforeEach(() => execSyncSpy.mockReset());

  it('passes bounds in correct GDAL -te order: xmin ymin xmax ymax', () => {
    // Bug this catches: lat/lng swapped in -te produces an empty or
    // wrong-region clip. GDAL -te expects xmin ymin xmax ymax which
    // maps to minLng minLat maxLng maxLat — easy to get backwards.
    clipToRegion('/in.tif', '/out.tif', NE_REGION);

    const cmd = execSyncSpy.mock.calls[0][0] as string;
    // -te xmin ymin xmax ymax → minLng minLat maxLng maxLat
    expect(cmd).toContain(`-te ${NE_REGION.minLng} ${NE_REGION.minLat} ${NE_REGION.maxLng} ${NE_REGION.maxLat}`);
  });

  it('reprojects to EPSG:4326', () => {
    // Bug this catches: missing -t_srs leaves raster in source CRS,
    // so ST_Value queries with WGS84 coordinates return null.
    clipToRegion('/in.tif', '/out.tif', NE_REGION);

    const cmd = execSyncSpy.mock.calls[0][0] as string;
    expect(cmd).toContain('-t_srs EPSG:4326');
  });

  it('includes -overwrite flag', () => {
    // Bug this catches: without -overwrite, re-running the pipeline
    // silently uses stale cached output files instead of fresh clips.
    clipToRegion('/in.tif', '/out.tif', NE_REGION);

    const cmd = execSyncSpy.mock.calls[0][0] as string;
    expect(cmd).toContain('-overwrite');
  });

  it('uses gdalwarp as the clipping tool', () => {
    // Bug this catches: accidentally using gdal_translate or another
    // tool that doesn't support reprojection + clipping in one step.
    clipToRegion('/in.tif', '/out.tif', NE_REGION);

    const cmd = execSyncSpy.mock.calls[0][0] as string;
    expect(cmd).toMatch(/^gdalwarp /);
  });
});

describe('getPool TLS policy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_SSL_CA', '');
    vi.stubEnv('DIRECT_URL', '');
  });

  it('applies certificate-verified TLS to remote hosts, same as the server', async () => {
    // Bug this catches: new Pool({ connectionString }) uses pg-native URL
    // semantics — no sslmode means PLAINTEXT to the same database the server
    // connects to with verified TLS. Same URL, different security level.
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@db.abc.supabase.co:5432/landmatch');

    const { getPool } = await import('../lib/postgis');
    const pool = getPool();

    expect(pool.options.ssl).toEqual({ rejectUnauthorized: true, ca: undefined });
  });

  it('keeps localhost plaintext for local ETL runs', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/landmatch');

    const { getPool } = await import('../lib/postgis');
    const pool = getPool();

    expect(pool.options.ssl).toBeUndefined();
  });
});

describe('psqlSafeUrl', () => {
  it('passes local URLs through untouched', async () => {
    const { psqlSafeUrl } = await import('../lib/postgis');
    const url = 'postgresql://postgres:postgres@localhost:5432/landmatch';

    expect(psqlSafeUrl(url)).toBe(url);
  });

  it('passes a remote URL through when it pins sslmode=verify-full', async () => {
    const { psqlSafeUrl } = await import('../lib/postgis');
    const url = 'postgresql://u:p@db.example.com:5432/landmatch?sslmode=verify-full';

    expect(psqlSafeUrl(url)).toBe(url);
  });

  it('refuses to hand psql a remote URL without verify-full', async () => {
    // Bug this catches: psql defaults to sslmode=prefer — silently downgrades
    // to plaintext (or unverified TLS) against a remote database while the
    // rest of the stack requires verified TLS.
    const { psqlSafeUrl } = await import('../lib/postgis');

    expect(() => psqlSafeUrl('postgresql://u:p@db.example.com:5432/landmatch')).toThrow(/verify-full/);
    expect(() => psqlSafeUrl('postgresql://u:p@db.example.com:5432/landmatch?sslmode=require')).toThrow(/verify-full/);
  });
});
