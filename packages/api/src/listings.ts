import { z } from 'zod';

import { HttpUrl } from './url';

// Full lifecycle of listings.enrichment_status — single owner of the
// vocabulary. 'pending' = never enriched; the other three are run outcomes
// (see deriveEnrichmentStatus in @landmatch/enrichment).
export const ListingEnrichmentStatus = z.enum(['pending', 'enriched', 'partial', 'failed']);

export type ListingEnrichmentStatus = z.infer<typeof ListingEnrichmentStatus>;

// Length caps (tcd.3 audit): everything here is user-supplied or scraped from
// third-party pages, then forwarded to geocoders, stored, and rendered into
// email subjects — the global 100KB body limit alone left fields absurdly wide.
export const EnrichListingRequest = z.object({
  // 500 matches the bound applied to geocoder RESPONSES (boundedString in
  // @landmatch/enrichment) — no legitimate address is longer.
  address: z.string().min(1).max(500),
  price: z.number().positive().optional(),
  acreage: z.number().positive().optional(),
  url: HttpUrl.max(2048, 'URL too long').optional(),
  // Scraped third-party titles TRUNCATE rather than reject (without leaving a
  // split surrogate pair) — display data must never block enrichment. The
  // identifier-like fields below stay hard caps: truncation would corrupt them.
  title: z
    .string()
    .transform((s) => s.slice(0, 200).replace(/[\uD800-\uDBFF]$/, ''))
    .optional(),
  source: z.string().max(100).optional(),
  externalId: z.string().max(100).optional(),
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
    title: z.string().nullable(),
    enrichmentStatus: ListingEnrichmentStatus,
  }),
  enrichment: z.object({
    soilCapabilityClass: z.number().nullable(),
    soilDrainageClass: z.string().nullable(),
    soilTexture: z.string().nullable(),
    femaFloodZone: z.string().nullable(),
    zoningCode: z.string().nullable(),
    fireRiskScore: z.number().nullable(),
    floodRiskScore: z.number().nullable(),
    frostFreeDays: z.number().nullable(),
    growingSeasonDays: z.number().nullable(),
    elevationFt: z.number().nullable(),
    slopePct: z.number().nullable(),
    annualPrecipIn: z.number().nullable(),
    sourcesUsed: z.array(z.string()),
    errors: z.array(z.object({ source: z.string(), error: z.string() })),
  }),
  homesteadScore: z.number().nullable(),
  homesteadComponents: z.record(z.string(), HomesteadComponent).nullable(),
});

export type EnrichListingResponse = z.infer<typeof EnrichListingResponse>;

export const ListingByUrlQuery = z.object({
  url: HttpUrl,
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
