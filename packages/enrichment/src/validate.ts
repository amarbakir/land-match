import { z } from 'zod';

// Shared inbound-data validation primitives for adapters.

// pg returns NUMERIC/ROUND results as strings; null means missing data (e.g.
// a point that missed a raster tile). The union is load-bearing: a bare
// z.coerce.number() would turn null into 0 and fabricate values (0°F temps,
// "perfectly flat" slopes) instead of failing.
export const pgNumeric = z.union([z.number(), z.string()]).pipe(z.coerce.number());

// Vendor text is unbounded — truncate before storage rather than reject the
// whole enrichment over one long field.
export function boundedString(max: number) {
  return z.string().transform((s) => s.slice(0, max));
}
