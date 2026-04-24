import { describe, expect, it, vi } from 'vitest';
import { createWetlandsAdapter } from '../wetlands';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createWetlandsAdapter', () => {
  it('maps DB columns to WetlandsData fields', async () => {
    // Bug this catches: wrong column mapped to wrong field.
    // "attribute" in DB maps to "wetlandDescription", not "wetlandType".
    const pool = mockPool([{
      wetland_type: 'PFO1A',
      attribute: 'Freshwater Forested/Shrub Wetland',
      distance_ft: 150,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.wetlandType).toBe('PFO1A');
      expect(result.data.wetlandDescription).toBe('Freshwater Forested/Shrub Wetland');
      expect(result.data.distanceFt).toBe(150);
    }
  });

  it('returns success with null/Infinity when no wetland found within buffer', async () => {
    // Bug this catches: if "no rows" is treated as an error instead of a valid
    // "no wetland nearby" result, the enrichment pipeline would mark this
    // adapter as failed when it should succeed with null data.
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.wetlandType).toBeNull();
      expect(result.data.wetlandDescription).toBeNull();
      expect(result.data.distanceFt).toBe(Infinity);
    }
  });

  it('handles distance_ft of 0 for on-parcel wetlands', async () => {
    // Bug this catches: distance 0 is falsy in JS. If someone adds
    // `if (!row.distance_ft)` as a guard, on-parcel wetlands would be
    // treated as "no wetland found".
    const pool = mockPool([{
      wetland_type: 'PEM1C',
      attribute: 'Freshwater Emergent Wetland',
      distance_ft: 0,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.distanceFt).toBe(0);
      expect(result.data.wetlandType).toBe('PEM1C');
    }
  });

  it('coerces string distance from pg driver to number', async () => {
    // Bug this catches: pg returns ROUND(...)::integer as a string.
    const pool = mockPool([{
      wetland_type: 'PFO1A',
      attribute: 'Freshwater Forested/Shrub Wetland',
      distance_ft: '150',
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.distanceFt).toBe('number');
    }
  });

  it('wraps query exceptions in Result.error instead of throwing', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
  });

  it('passes buffer distance as third parameter', async () => {
    // Bug this catches: if buffer parameter is omitted or hardcoded wrong,
    // the query searches the wrong radius. The SQL uses $3 * 0.3048 to
    // convert feet to meters.
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    await adapter.enrich({ lat: 43.1, lng: -72.78 });

    const params = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(params[2]).toBe(1000); // BUFFER_FT
  });
});
