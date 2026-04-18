import { boolean, jsonb, pgTable, text, timestamp, integer, real, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  authProvider: text('auth_provider').notNull().default('email'),
  passwordHash: text('password_hash'),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  notificationPrefs: jsonb('notification_prefs'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

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
});

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  externalId: text('external_id'),
  source: text('source').notNull(),
  url: text('url'),
  title: text('title'),
  description: text('description'),
  price: real('price'),
  acreage: real('acreage'),
  address: text('address'),
  city: text('city'),
  county: text('county'),
  state: text('state'),
  zip: text('zip'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  rawData: jsonb('raw_data'),
  enrichmentStatus: text('enrichment_status').notNull().default('pending'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  delistedAt: timestamp('delisted_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  uniqueIndex('listings_external_id_source_idx').on(table.externalId, table.source),
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
  verifiedAcreage: real('verified_acreage'),
  parcelGeometry: jsonb('parcel_geometry'),
  // Climate (feature-flagged)
  fireRiskScore: integer('fire_risk_score'),
  floodRiskScore: integer('flood_risk_score'),
  heatRiskScore: integer('heat_risk_score'),
  droughtRiskScore: integer('drought_risk_score'),
  // Meta
  enrichedAt: timestamp('enriched_at', { withTimezone: true, mode: 'date' }),
  sourcesUsed: text('sources_used').array(),
});

export const scores = pgTable('scores', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull().references(() => listings.id),
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id),
  overallScore: integer('overall_score').notNull(),
  componentScores: jsonb('component_scores').notNull(),
  llmSummary: text('llm_summary'),
  scoredAt: timestamp('scored_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

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
});
