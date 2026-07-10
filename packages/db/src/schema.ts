import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, jsonb, pgTable, text, timestamp, integer, real, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  phone: text('phone'),
  authProvider: text('auth_provider').notNull().default('email'),
  passwordHash: text('password_hash'),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  notificationPrefs: jsonb('notification_prefs'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  // Case-insensitive uniqueness: prevents case-variant duplicate accounts and
  // makes the lower(email)=$1 lookup in userRepo.findByEmail index-backed.
  uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
]);

export const searchProfiles = pgTable('search_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  alertFrequency: text('alert_frequency').notNull().default('daily'),
  alertThreshold: integer('alert_threshold').notNull().default(60),
  criteria: jsonb('criteria').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('search_profiles_user_id_idx').on(table.userId),
]);

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  externalId: text('external_id'),
  source: text('source').notNull(),
  url: text('url'),
  title: text('title'),
  description: text('description'),
  // double precision (not real/float4): float4's ~7 significant digits round
  // million-dollar prices to the nearest ~$10 and shift lat/lng enough to land
  // a point in the wrong flood zone on boundary-sensitive lookups.
  price: doublePrecision('price'),
  acreage: doublePrecision('acreage'),
  address: text('address'),
  city: text('city'),
  county: text('county'),
  state: text('state'),
  zip: text('zip'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  rawData: jsonb('raw_data'),
  enrichmentStatus: text('enrichment_status').notNull().default('pending'),
  // Re-enrichment runs (jobs/runReEnrichment) bump this; rows at the cap stop retrying
  enrichmentAttempts: integer('enrichment_attempts').notNull().default(0),
  userId: text('user_id').references(() => users.id),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  delistedAt: timestamp('delisted_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  // External identity is per ownership scope: ownerless feed rows keep global
  // (external_id, source) identity, while owned rows are each user's private
  // research copy (0jx.10 copies enrichment across users) — a global unique
  // index would 500 the second user enriching the same Zillow/MLS listing.
  uniqueIndex('listings_feed_external_id_idx')
    .on(table.externalId, table.source)
    .where(sql`${table.userId} IS NULL`),
  uniqueIndex('listings_user_external_id_idx')
    .on(table.userId, table.externalId, table.source)
    .where(sql`${table.userId} IS NOT NULL`),
  index('listings_url_idx').on(table.url),
  // DB-enforced enrich dedupe (land-match-ckt): one owned row per (user, url).
  // The service-layer URL dedupe is an advisory read-then-insert; without this
  // index two concurrent POST /enrich both pass the lookups and both insert.
  // Ownerless feed rows are deliberately unconstrained (delist/relist may
  // legitimately repeat URLs), as are URL-less manual entries.
  uniqueIndex('listings_user_url_idx')
    .on(table.userId, table.url)
    .where(sql`${table.url} IS NOT NULL AND ${table.userId} IS NOT NULL`),
  // Re-enrichment candidate scan: cost tracks the (small) live-retryable set,
  // not the table. Predicate mirrors findListingsNeedingEnrichment — capped
  // (attempts >= 5, see MAX_ENRICHMENT_ATTEMPTS) and coordinate-less rows
  // would otherwise accumulate at the front of the scan forever.
  index('listings_reenrich_idx')
    .on(table.firstSeenAt)
    .where(sql`${table.enrichmentStatus} <> 'enriched' AND ${table.enrichmentAttempts} < 5 AND ${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL`),
]);

export const savedListings = pgTable('saved_listings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  listingId: text('listing_id').notNull().references(() => listings.id),
  savedAt: timestamp('saved_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('saved_listings_user_listing_idx').on(table.userId, table.listingId),
]);

export const enrichments = pgTable('enrichments', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull().references(() => listings.id).unique(),
  // Soil
  soilCapabilityClass: integer('soil_capability_class'),
  soilDrainageClass: text('soil_drainage_class'),
  soilTexture: text('soil_texture'),
  soilSuitabilityRatings: jsonb('soil_suitability_ratings'),
  // Flood
  femaFloodZone: text('fema_flood_zone'),
  floodZoneDescription: text('flood_zone_description'),
  // Parcel (feature-flagged)
  zoningCode: text('zoning_code'),
  zoningDescription: text('zoning_description'),
  verifiedAcreage: doublePrecision('verified_acreage'),
  parcelGeometry: jsonb('parcel_geometry'),
  // Climate (feature-flagged)
  fireRiskScore: integer('fire_risk_score'),
  floodRiskScore: integer('flood_risk_score'),
  heatRiskScore: integer('heat_risk_score'),
  droughtRiskScore: integer('drought_risk_score'),
  // Climate normals (PRISM)
  frostFreeDays: integer('frost_free_days'),
  annualPrecipIn: real('annual_precip_in'),
  avgMinTempF: real('avg_min_temp_f'),
  avgMaxTempF: real('avg_max_temp_f'),
  growingSeasonDays: integer('growing_season_days'),
  // Elevation (3DEP)
  elevationFt: real('elevation_ft'),
  slopePct: real('slope_pct'),
  // Wetlands (NWI)
  wetlandType: text('wetland_type'),
  wetlandDescription: text('wetland_description'),
  wetlandWithinBufferFt: integer('wetland_within_buffer_ft'),
  // Meta
  enrichedAt: timestamp('enriched_at', { withTimezone: true, mode: 'date' }),
  sourcesUsed: text('sources_used').array(),
  // Computed
  homesteadScore: integer('homestead_score'),
});

export const scores = pgTable('scores', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull().references(() => listings.id),
  // Scores are derived artifacts of a profile — deleting the profile must not
  // be blocked by them (every active profile gets scored automatically).
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id, { onDelete: 'cascade' }),
  overallScore: integer('overall_score').notNull(),
  componentScores: jsonb('component_scores').notNull(),
  llmSummary: text('llm_summary'),
  status: text('status').notNull().default('inbox'),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  scoredAt: timestamp('scored_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('scores_search_profile_id_idx').on(table.searchProfileId),
  // One score per listing+profile — makes concurrent matching runs converge
  // (insert ... onConflictDoNothing) instead of double-scoring and
  // double-alerting. Also serves listing_id-prefix lookups, so no separate
  // listing_id index.
  uniqueIndex('scores_listing_profile_idx').on(table.listingId, table.searchProfileId),
]);

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  // Cascade with the profile (alerts are its derived artifacts), and with the
  // score row so profile-cascade ordering can never trip the score_id FK.
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id, { onDelete: 'cascade' }),
  listingId: text('listing_id').notNull().references(() => listings.id),
  scoreId: text('score_id').notNull().references(() => scores.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  status: text('status').notNull().default('pending'),
  // Failed delivery attempts so far; transient failures release back to
  // pending with attempts+1, terminal 'failed' only past the max
  attempts: integer('attempts').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  // Set when a delivery worker claims the alert (status 'processing') so
  // concurrent workers never send the same alert twice; stale claims are
  // re-claimable after a timeout.
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('alerts_status_idx').on(table.status),
  // sent_at makes the claim query's sent-within-window probe and
  // findLastSentAt's newest-sent lookup index-only on the time range —
  // a group's sent history grows without bound.
  index('alerts_user_profile_status_idx').on(table.userId, table.searchProfileId, table.status, table.sentAt),
  // One alert per score+channel — concurrent matching runs can't double-email
  uniqueIndex('alerts_score_channel_idx').on(table.scoreId, table.channel),
]);

// Server-side record of issued refresh tokens (hashed — a DB leak must not
// yield usable tokens). family_id groups a rotation chain: reusing an
// already-rotated token is theft evidence and revokes the whole family.
export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  familyId: text('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  // Set when the token is exchanged during rotation — a second use after this
  // is reuse. Kept (not deleted) until expiry so reuse stays detectable.
  rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'date' }),
  // Set by logout or family revocation on detected reuse.
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
  index('refresh_tokens_user_id_idx').on(table.userId),
  index('refresh_tokens_family_id_idx').on(table.familyId),
]);

// Fixed-window rate-limit counters, shared across server instances (Fargate
// tasks, Lambda containers) so limits don't multiply with concurrency.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(), // "<scope>:<client ip>"
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => [
  // Backs the expired-window sweep DELETE
  index('rate_limits_reset_at_idx').on(table.resetAt),
]);
