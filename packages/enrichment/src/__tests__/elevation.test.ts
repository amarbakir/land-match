import { describe, expect, it, vi } from 'vitest';
import { createElevationAdapter } from '../elevation';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createElevationAdapter', () => {
  it('returns elevation and slope from PostGIS query', async () => {
    const pool = mockPool([{ elevation_ft: 1247.3, slope_pct: 8.2 }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ elevationFt: 1247.3, slopePct: 8.2 });
    }
  });

  it('returns error when no raster data found', async () => {
    const pool = mockPool([{ elevation_ft: null, slope_pct: null }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('timeout');
    }
  });

  it('has correct name and is available', () => {
    const pool = mockPool([]);
    const adapter = createElevationAdapter(pool);
    expect(adapter.name).toBe('usgs-3dep-elevation');
    expect(adapter.isAvailable()).toBe(true);
  });
});
