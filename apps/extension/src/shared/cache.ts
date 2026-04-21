import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from './config';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_KEY = 'landmatch_enrichment_cache';

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getCache(): Promise<Record<string, CacheEntry<unknown>>> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] ?? {};
}

async function setCache(cache: Record<string, CacheEntry<unknown>>): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getCached<T>(address: string): Promise<T | null> {
  const cache = await getCache();
  const key = normalizeAddress(address);
  const entry = cache[key];

  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key];
    await setCache(cache);
    return null;
  }

  return entry.data as T;
}

export async function setCached<T>(address: string, data: T): Promise<void> {
  const cache = await getCache();
  const key = normalizeAddress(address);

  cache[key] = { data, timestamp: Date.now() };

  // LRU eviction: remove oldest entries if over limit
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    const toRemove = sorted.slice(0, keys.length - CACHE_MAX_ENTRIES);
    for (const k of toRemove) {
      delete cache[k];
    }
  }

  await setCache(cache);
}
