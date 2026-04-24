import { describe, expect, it, vi } from 'vitest';
import { createWetlandsAdapter } from '../wetlands';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createWetlandsAdapter', () => {
  it('returns wetland data when wetland found within buffer', async () => {
    const pool = mockPool([{
      wetland_type: 'PFO1A',
      attribute: 'Freshwater Forested/Shrub Wetland',
      distance_ft: 150,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        wetlandType: 'PFO1A',
        wetlandDescription: 'Freshwater Forested/Shrub Wetland',
        distanceFt: 150,
      });
    }
  });

  it('returns null wetland type when none found within buffer', async () => {
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        wetlandType: null,
        wetlandDescription: null,
        distanceFt: Infinity,
      });
    }
  });

  it('returns closest wetland when multiple found', async () => {
    const pool = mockPool([{
      wetland_type: 'PEM1C',
      attribute: 'Freshwater Emergent Wetland',
      distance_ft: 50,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.distanceFt).toBe(50);
    }
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
  });

  it('has correct name and is available', () => {
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    expect(adapter.name).toBe('usfws-nwi-wetlands');
    expect(adapter.isAvailable()).toBe(true);
  });
});
