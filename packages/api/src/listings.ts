import { z } from 'zod';

export const EnrichListingRequest = z.object({
  address: z.string().min(1),
  price: z.number().positive().optional(),
  acreage: z.number().positive().optional(),
  url: z.string().url().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  externalId: z.string().optional(),
});

export type EnrichListingRequest = z.infer<typeof EnrichListingRequest>;

export const EnrichListingResponse = z.object({
  listing: z.object({
    id: z.string(),
    address: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    price: z.number().nullable(),
    acreage: z.number().nullable(),
    enrichmentStatus: z.string(),
  }),
  enrichment: z.object({
    soilCapabilityClass: z.number().nullable(),
    soilDrainageClass: z.string().nullable(),
    soilTexture: z.string().nullable(),
    femaFloodZone: z.string().nullable(),
    zoningCode: z.string().nullable(),
    fireRiskScore: z.number().nullable(),
    floodRiskScore: z.number().nullable(),
    sourcesUsed: z.array(z.string()),
    errors: z.array(z.object({ source: z.string(), error: z.string() })),
  }),
});

export type EnrichListingResponse = z.infer<typeof EnrichListingResponse>;

export const ListingByUrlQuery = z.object({
  url: z.string().url(),
});

export type ListingByUrlQuery = z.infer<typeof ListingByUrlQuery>;

export const SaveListingResponse = z.object({
  savedAt: z.string(),
});

export type SaveListingResponse = z.infer<typeof SaveListingResponse>;
