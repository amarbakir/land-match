import { describe, expect, it, vi } from 'vitest';
import { createElevationAdapter } from '../elevation';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createElevationAdapter', () => {
  it('coerces pg string results to numbers', async () => {
    // Bug this catches: Postgres ROUND(...::numeric, 1) returns strings via pg driver.
    // Without Number() coercion, elevation "1247.3" as a string would break
    // downstream comparisons like elevationFt > 1000.
    const pool = mockPool([{ elevation_ft: '1247.3', slope_pct: '8.2' }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.elevationFt).toBe('number');
      expect(typeof result.data.slopePct).toBe('number');
      expect(result.data.elevationFt).toBe(1247.3);
      expect(result.data.slopePct).toBe(8.2);
    }
  });

  it('returns error when elevation is null (point outside raster coverage)', async () => {
    // Bug this catches: without null check, Number(null) = 0 and the adapter
    // would report elevation 0 ft for ocean/uncovered areas.
    const pool = mockPool([{ elevation_ft: null, slope_pct: null }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No elevation data');
    }
  });

  it('wraps query exceptions in Result.error instead of throwing', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('timeout');
    }
  });

  it('passes coordinates as [lng, lat] not [lat, lng]', async () => {
    // Bug this catches: ST_MakePoint takes (x, y) = (lng, lat).
    const pool = mockPool([]);
    const adapter = createElevationAdapter(pool);
    await adapter.enrich({ lat: 43.1, lng: -72.78 });

    const params = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(params[0]).toBe(-72.78); // lng first
    expect(params[1]).toBe(43.1);   // lat second
  });
});
