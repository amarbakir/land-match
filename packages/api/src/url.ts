import { z } from 'zod';

// Listing URLs are rendered as clickable links in the frontend and alert
// emails; any non-web scheme (javascript:, data:, file:) is a stored-XSS
// vector. Allowlist http/https instead of blocklisting bad schemes.
export function isHttpUrl(value: string | null | undefined): value is string {
  return value != null && /^https?:\/\//i.test(value);
}

export const HttpUrl = z.url({ protocol: /^https?$/, error: 'URL must use http or https' });
