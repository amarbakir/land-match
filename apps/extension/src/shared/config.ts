// Credentials travel over this URL. Production bundles must point at a real
// https endpoint — never the localhost fallback, never plaintext http.
function resolveApiBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  if (import.meta.env.PROD && !url.startsWith('https://')) {
    throw new Error(
      `VITE_API_BASE_URL must be an https:// URL in production builds (got "${url}")`,
    );
  }

  return url;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CACHE_MAX_ENTRIES = 500;
