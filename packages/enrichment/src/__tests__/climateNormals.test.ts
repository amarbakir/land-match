import { describe, expect, it, vi } from 'vitest';
import { createClimateNormalsAdapter } from '../climateNormals';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createClimateNormalsAdapter', () => {
  it('returns climate normals from PostGIS query', async () => {
    const pool = mockPool([{
      frost_free_days: 158,
      annual_precip_in: 42.3,
      avg_min_temp_f: 28.1,
      avg_max_temp_f: 72.5,
      growing_season_days: 165,
    }]);

    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        frostFreeDays: 158,
        annualPrecipIn: 42.3,
        avgMinTempF: 28.1,
        avgMaxTempF: 72.5,
        growingSeasonDays: 165,
      });
    }

    expect(pool.query).toHaveBeenCalledOnce();
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('ST_Value');
  });

  it('returns error when PostGIS query returns no rows', async () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No climate normals data');
    }
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('connection refused')) } as unknown as Pool;
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('connection refused');
    }
  });

  it('reports isAvailable as true', () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    expect(adapter.isAvailable()).toBe(true);
  });

  it('has correct name', () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    expect(adapter.name).toBe('prism-climate-normals');
  });
});
