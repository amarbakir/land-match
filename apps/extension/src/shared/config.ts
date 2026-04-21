export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const API_V1 = `${API_BASE_URL}/api/v1`;

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CACHE_MAX_ENTRIES = 500;
