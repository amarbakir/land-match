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

export const HomesteadComponent = z.object({
  score: z.number(),
  label: z.string(),
});

export type HomesteadComponent = z.infer<typeof HomesteadComponent>;

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
  homesteadScore: z.number().nullable(),
  homesteadComponents: z.record(z.string(), HomesteadComponent).nullable(),
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

export const SavedListingItem = z.object({
  id: z.string(),
  savedAt: z.string(),
  listingId: z.string(),
  title: z.string().nullable(),
  address: z.string(),
  price: z.number().nullable(),
  acreage: z.number().nullable(),
  source: z.string().nullable(),
  url: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  soilClass: z.number().nullable(),
  floodZone: z.string().nullable(),
  zoning: z.string().nullable(),
  homesteadScore: z.number().nullable(),
  bestScore: z.object({ score: z.number(), profileName: z.string() }).nullable(),
});
export type SavedListingItem = z.infer<typeof SavedListingItem>;

export const PaginatedSavedListings = z.object({
  items: z.array(SavedListingItem),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type PaginatedSavedListings = z.infer<typeof PaginatedSavedListings>;

export const SavedListingsFilters = z.object({
  sort: z.enum(['date', 'homestead', 'price', 'acreage']).optional().default('date'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type SavedListingsFilters = z.infer<typeof SavedListingsFilters>;
