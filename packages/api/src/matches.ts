import { z } from 'zod';

export const MatchStatus = z.enum(['inbox', 'shortlisted', 'dismissed']);
export type MatchStatus = z.infer<typeof MatchStatus>;

export const ComponentScores = z.object({
  soil: z.number(),
  flood: z.number(),
  price: z.number(),
  acreage: z.number(),
  zoning: z.number(),
  geography: z.number(),
  infrastructure: z.number(),
  climate: z.number(),
});

export const MatchItem = z.object({
  scoreId: z.string(),
  listingId: z.string(),
  overallScore: z.number(),
  componentScores: ComponentScores,
  llmSummary: z.string().nullable(),
  status: MatchStatus,
  readAt: z.string().nullable(),
  scoredAt: z.string(),
  title: z.string().nullable(),
  address: z.string(),
  price: z.number().nullable(),
  acreage: z.number().nullable(),
  source: z.string().nullable(),
  url: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  soilClass: z.number().nullable(),
  soilClassLabel: z.string().nullable(),
  primeFarmland: z.boolean().nullable(),
  floodZone: z.string().nullable(),
  zoning: z.string().nullable(),
});
export type MatchItem = z.infer<typeof MatchItem>;

export const MatchFilters = z.object({
  status: MatchStatus.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(['score', 'date', 'price', 'acreage']).optional().default('score'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type MatchFilters = z.infer<typeof MatchFilters>;

export const PaginatedMatches = z.object({
  items: z.array(MatchItem),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type PaginatedMatches = z.infer<typeof PaginatedMatches>;

export const UpdateMatchStatus = z.object({
  status: MatchStatus.optional(),
  markAsRead: z.boolean().optional(),
});
export type UpdateMatchStatus = z.infer<typeof UpdateMatchStatus>;

export const ProfileCountItem = z.object({
  profileId: z.string(),
  total: z.number(),
  unread: z.number(),
  shortlisted: z.number(),
});

export const ProfileCounts = z.array(ProfileCountItem);
export type ProfileCounts = z.infer<typeof ProfileCounts>;
