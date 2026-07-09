// Credentials travel over this URL. Production builds (expo export sets
// NODE_ENV=production) must be pointed at a real https endpoint — never the
// localhost fallback, never plaintext http.
export function resolveApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

  if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL must be an https:// URL in production builds (got "${url}")`,
    );
  }

  return url;
}
