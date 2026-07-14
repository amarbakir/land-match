// Shared text/URL parsing helpers for site extractors.

// e.g. "WI 54656" — used to decide whether a page heading is a street address
export const US_STATE_ZIP_PATTERN = /\b[A-Z]{2}\s+\d{5}/;

// The server schema requires positive numbers (z.number().positive()), so 0,
// NaN, and placeholder values must come back as undefined, not slip into the
// payload and 400 the enrich request.
function positiveOrUndefined(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parsePrice(text?: string | null): number | undefined {
  const digits = text?.replace(/[^0-9.]/g, '');
  return digits ? positiveOrUndefined(parseFloat(digits)) : undefined;
}

export function parseAcreage(text?: string | null): number | undefined {
  // "acre(s)" in any case, incl. hyphenated "12.4-Acre"; the bare "ac"
  // abbreviation only lowercase so "2 AC units" isn't read as acreage
  const match =
    text?.match(/(\d[\d,.]*)[\s-]*acres?\b/i) ?? text?.match(/(\d[\d,.]*)[\s-]*ac\b/);
  return match ? positiveOrUndefined(parseFloat(match[1].replace(/,/g, ''))) : undefined;
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
