// Shared text/URL parsing helpers for site extractors.

// e.g. "WI 54656" — used to decide whether a page heading is a street address
export const US_STATE_ZIP_PATTERN = /\b[A-Z]{2}\s+\d{5}/;

export function parsePrice(text?: string | null): number | undefined {
  const digits = text?.replace(/[^0-9.]/g, '');
  return digits ? parseFloat(digits) : undefined;
}

export function parseAcreage(text?: string | null): number | undefined {
  const match = text?.match(/([\d,.]+)\s*(?:acres?|ac\b)/i);
  return match ? parseFloat(match[1].replace(/,/g, '')) : undefined;
}

export function joinAddressParts(
  ...parts: Array<string | undefined>
): string | undefined {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join(', ') : undefined;
}

// Listing id as the trailing numeric path segment (LandWatch, LandFlip)
export function extractTrailingId(url: string): string | undefined {
  return url.match(/\/(\d+)$/)?.[1];
}
