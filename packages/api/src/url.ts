import { z } from 'zod';

// Listing URLs are rendered as clickable links in the frontend and alert
// emails; any non-web scheme (javascript:, data:, file:) is a stored-XSS
// vector. Allowlist http/https instead of blocklisting bad schemes.
// Deliberately NO length cap here: this schema backs the read-side sanitizer
// (isHttpUrl) and GET /by-url — a cap would retroactively null the links of
// already-stored long URLs and 400 the extension's pre-check for such pages.
// Length is a write-boundary concern (EnrichListingRequest caps at 2048).
export const HttpUrl = z.url({ protocol: /^https?$/, error: 'URL must use http or https' });

// Derived from HttpUrl so write-side validation and read-side sanitization can
// never disagree about what a safe listing URL is.
export function isHttpUrl(value: string | null | undefined): value is string {
  return value != null && HttpUrl.safeParse(value).success;
}
