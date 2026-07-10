import { z } from 'zod';

export const ScoringComponent = z.enum([
  'soil', 'flood', 'price', 'acreage', 'zoning', 'geography', 'infrastructure', 'climate',
]);

export type ScoringComponent = z.infer<typeof ScoringComponent>;

const Range = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: 'min must be <= max',
  });

// Filter values are short vocabulary codes (flood zones, zoning codes) — cap
// element length and list size so criteria jsonb stays bounded (tcd.3 audit).
const filterList = z.array(z.string().max(100)).max(50);

export const SearchCriteria = z.object({
  acreage: Range.optional(),
  price: Range.optional(),
  soilCapabilityClass: z.object({ max: z.number() }).optional(),
  floodZoneExclude: filterList.optional(),
  geography: z
    .object({
      type: z.enum(['radius', 'counties', 'driveTime']),
      center: z
        .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
        .optional(),
      radiusMiles: z.number().positive().optional(),
    })
    .optional(),
  zoning: filterList.optional(),
  infrastructure: filterList.optional(),
  climateRisk: z
    .object({
      maxFireRisk: z.number().optional(),
      maxFloodRisk: z.number().optional(),
    })
    .optional(),
  // Relative weights — 100 gives ample headroom over the ~1.0-scale defaults.
  weights: z.partialRecord(ScoringComponent, z.number().min(0).max(100)).optional(),
});

export type SearchCriteria = z.infer<typeof SearchCriteria>;

export const CreateSearchProfile = z.object({
  // Stored and rendered in alert emails ("N new matches for <name>").
  name: z.string().min(1).max(200),
  alertFrequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
  alertThreshold: z.number().int().min(0).max(100).default(60),
  criteria: SearchCriteria,
  isActive: z.boolean().default(true),
});

export type CreateSearchProfile = z.infer<typeof CreateSearchProfile>;

export const UpdateSearchProfile = CreateSearchProfile.partial();

export type UpdateSearchProfile = z.infer<typeof UpdateSearchProfile>;

export const SearchProfileResponse = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  alertFrequency: z.string(),
  alertThreshold: z.number(),
  criteria: SearchCriteria,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SearchProfileResponse = z.infer<typeof SearchProfileResponse>;
