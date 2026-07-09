import { z } from 'zod';

// Shared inbound-data validation primitives for adapters.

// Numbers arrive as strings (pg NUMERIC results, geocoder JSON); null and
// blank strings mean missing data. Every branch here is load-bearing: a bare
// z.coerce.number() turns null and '' into 0 and fabricates values (0°F
// temps, "perfectly flat" slopes, listings pinned at the equator) instead of
// failing. NaN is rejected by the final z.number().
export const strictNumeric = z
  .union([z.number(), z.string().refine((s) => s.trim() !== '')])
  .pipe(z.coerce.number());

// Vendor text is unbounded — truncate before storage rather than reject the
// whole enrichment over one long field.
export function boundedString(max: number) {
  return z.string().transform((s) => s.slice(0, max));
}
