import { describe, expect, it, vi } from 'vitest';
import { createClimateNormalsAdapter } from '../climateNormals';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createClimateNormalsAdapter', () => {
  it('maps snake_case DB columns to camelCase and rounds values', async () => {
    // Bug this catches: wrong column mapped to wrong field, or missing Number() coercion
    const pool = mockPool([{
      frost_free_days: 158.4,
      annual_precip_in: 42.37,
      avg_min_temp_f: 28.14,
      avg_max_temp_f: 72.56,
      growing_season_days: 165.7,
    }]);

    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Integers should be rounded, decimals to 1 place
      expect(result.data.frostFreeDays).toBe(158);
      expect(result.data.annualPrecipIn).toBe(42.4);
      expect(result.data.avgMinTempF).toBe(28.1);
      expect(result.data.avgMaxTempF).toBe(72.6);
      expect(result.data.growingSeasonDays).toBe(166);
    }
  });

  it('coerces string values from pg driver to numbers', async () => {
    // Bug this catches: pg returns NUMERIC/ROUND results as strings.
    // Without Number() coercion, "158" would pass through as a string and
    // downstream scoring comparisons like frostFreeDays > 120 would silently fail.
    const pool = mockPool([{
      frost_free_days: '158',
      annual_precip_in: '42.3',
      avg_min_temp_f: '28.1',
      avg_max_temp_f: '72.5',
      growing_season_days: '165',
    }]);

    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.frostFreeDays).toBe('number');
      expect(typeof result.data.annualPrecipIn).toBe('number');
      expect(result.data.frostFreeDays).toBe(158);
    }
  });

  it('returns error when frost_free_days is null (point on raster edge)', async () => {
    // Bug this catches: LEFT JOIN returns a row but with nulls when the point
    // falls outside one raster tile. Without this check, Number(null) = 0 and
    // the adapter would silently return frost_free_days: 0 instead of an error.
    const pool = mockPool([{
      frost_free_days: null,
      annual_precip_in: 42.3,
      avg_min_temp_f: null,
      avg_max_temp_f: 72.5,
      growing_season_days: null,
    }]);

    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No climate normals data');
    }
  });

  it('returns error when query returns no rows', async () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
  });

  it('wraps query exceptions in Result.error instead of throwing', async () => {
    // Bug this catches: if try/catch is removed, a DB connection error
    // would crash the entire enrichment pipeline instead of gracefully
    // failing just this adapter.
    const pool = { query: vi.fn().mockRejectedValue(new Error('connection refused')) } as unknown as Pool;
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('connection refused');
    }
  });

  it('passes coordinates as [lng, lat] not [lat, lng]', async () => {
    // Bug this catches: ST_MakePoint takes (x, y) = (lng, lat).
    // Swapping them puts the query point in the wrong hemisphere.
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    await adapter.enrich({ lat: 43.1, lng: -72.78 });

    const params = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(params[0]).toBe(-72.78); // lng first
    expect(params[1]).toBe(43.1);   // lat second
  });
});
