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
  userId: text('user_id').references(() => users.id),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  delistedAt: timestamp('delisted_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  uniqueIndex('listings_external_id_source_idx').on(table.externalId, table.source),
  index('listings_url_idx').on(table.url),
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
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id),
  overallScore: integer('overall_score').notNull(),
  componentScores: jsonb('component_scores').notNull(),
  llmSummary: text('llm_summary'),
  status: text('status').notNull().default('inbox'),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  scoredAt: timestamp('scored_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('scores_search_profile_id_idx').on(table.searchProfileId),
  index('scores_listing_id_idx').on(table.listingId),
]);

export const alerts = pgTable('alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id),
  listingId: text('listing_id').notNull().references(() => listings.id),
  scoreId: text('score_id').notNull().references(() => scores.id),
  channel: text('channel').notNull(),
  status: text('status').notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('alerts_status_idx').on(table.status),
  index('alerts_user_profile_status_idx').on(table.userId, table.searchProfileId, table.status),
]);
