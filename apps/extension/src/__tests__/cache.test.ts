import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, setCached } from '../shared/cache';

// Mock chrome.storage.local
const storage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storage, items);
      }),
    },
  },
});

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
});

describe('cache', () => {
  it('returns null for cache miss', async () => {
    const result = await getCached('123 Main St, Anytown, USA');
    expect(result).toBeNull();
  });

  it('stores and retrieves a cached value', async () => {
    await setCached('123 Main St', { score: 85 });
    const result = await getCached<{ score: number }>('123 Main St');
    expect(result).toEqual({ score: 85 });
  });

  it('normalizes addresses for cache key (case + punctuation insensitive)', () => {
    // Bug this catches: if a user visits the same listing twice but the page
    // capitalizes the address differently, we'd miss the cache and waste an
    // API call + quota
    return (async () => {
      await setCached('123 Main St, Elko NV', { data: 'cached' });

      const result = await getCached('123 MAIN ST, ELKO NV');
      expect(result).toEqual({ data: 'cached' });

      const resultWithPunc = await getCached('123 Main St., Elko, NV');
      expect(resultWithPunc).toEqual({ data: 'cached' });
    })();
  });

  it('returns null for expired entries (TTL exceeded)', async () => {
    // Bug this catches: stale enrichment data shown after soil/flood data
    // has been updated on the server side
    await setCached('456 Oak Ave', { stale: true });

    // Manually set timestamp to 25 hours ago
    const cacheKey = 'landmatch_enrichment_cache';
    const cache = storage[cacheKey] as Record<string, { data: unknown; timestamp: number }>;
    const normalizedKey = '456oakave';
    cache[normalizedKey].timestamp = Date.now() - 25 * 60 * 60 * 1000;

    const result = await getCached('456 Oak Ave');
    expect(result).toBeNull();
  });

  it('evicts oldest entries when cache exceeds max size', async () => {
    // Fill cache to limit
    for (let i = 0; i < 501; i++) {
      await setCached(`addr-${i}`, { id: i });
    }

    const cacheKey = 'landmatch_enrichment_cache';
    const cache = storage[cacheKey] as Record<string, unknown>;
    const entries = Object.keys(cache);

    // Should have evicted the oldest to stay at 500
    expect(entries.length).toBeLessThanOrEqual(500);

    // The oldest entry (addr-0) should be evicted
    const oldest = await getCached<{ id: number }>('addr-0');
    expect(oldest).toBeNull();

    // The newest entry should still be there
    const newest = await getCached<{ id: number }>('addr-500');
    expect(newest).toEqual({ id: 500 });
  });
});
