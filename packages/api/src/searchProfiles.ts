import { z } from 'zod';

export const SearchCriteria = z.object({
  acreage: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  price: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  soilCapabilityClass: z.object({ max: z.number() }).optional(),
  floodZoneExclude: z.array(z.string()).optional(),
  geography: z
    .object({
      type: z.enum(['radius', 'counties', 'driveTime']),
      center: z.object({ lat: z.number(), lng: z.number() }).optional(),
      radiusMiles: z.number().optional(),
    })
    .optional(),
  zoning: z.array(z.string()).optional(),
  infrastructure: z.array(z.string()).optional(),
  climateRisk: z
    .object({
      maxFireRisk: z.number().optional(),
      maxFloodRisk: z.number().optional(),
    })
    .optional(),
  weights: z.record(z.string(), z.number()).optional(),
});

export type SearchCriteria = z.infer<typeof SearchCriteria>;

export const CreateSearchProfile = z.object({
  name: z.string().min(1),
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
