import { z } from 'zod';

// Listing URLs are rendered as clickable links in the frontend and alert
// emails; any non-web scheme (javascript:, data:, file:) is a stored-XSS
// vector. Allowlist http/https instead of blocklisting bad schemes. The 2048
// cap (classic browser bound) was the one field the tcd.3 length sweep would
// otherwise have left open under the 100KB body limit.
export const HttpUrl = z
  .url({ protocol: /^https?$/, error: 'URL must use http or https' })
  .max(2048, 'URL too long');

// Derived from HttpUrl so write-side validation and read-side sanitization can
// never disagree about what a safe listing URL is.
export function isHttpUrl(value: string | null | undefined): value is string {
  return value != null && HttpUrl.safeParse(value).success;
}
