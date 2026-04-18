import { eq } from 'drizzle-orm';
import { listings, enrichments } from '@landmatch/db';
import type { EnrichmentResult } from '@landmatch/enrichment';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertListingInput {
  address: string;
  latitude: number;
  longitude: number;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
}

export async function insertListing(input: InsertListingInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(listings)
    .values({
      id,
      source: 'manual',
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      price: input.price ?? null,
      acreage: input.acreage ?? null,
      url: input.url ?? null,
      title: input.title ?? null,
      enrichmentStatus: 'enriched',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning();

  return row;
}

export async function insertEnrichment(
  listingId: string,
  result: EnrichmentResult,
  tx?: Tx,
) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(enrichments)
    .values({
      id,
      listingId,
      soilCapabilityClass: result.soil?.capabilityClass ?? null,
      soilDrainageClass: result.soil?.drainageClass ?? null,
      soilTexture: result.soil?.texture ?? null,
      soilSuitabilityRatings: result.soil?.suitabilityRatings ?? null,
      femaFloodZone: result.flood?.zone ?? null,
      floodZoneDescription: result.flood?.description ?? null,
      zoningCode: result.parcel?.zoningCode ?? null,
      zoningDescription: result.parcel?.zoningDescription ?? null,
      verifiedAcreage: result.parcel?.verifiedAcreage ?? null,
      parcelGeometry: result.parcel?.geometry ?? null,
      fireRiskScore: result.climate?.fireRiskScore ?? null,
      floodRiskScore: result.climate?.floodRiskScore ?? null,
      heatRiskScore: result.climate?.heatRiskScore ?? null,
      droughtRiskScore: result.climate?.droughtRiskScore ?? null,
      enrichedAt: new Date(),
      sourcesUsed: result.sourcesUsed,
    })
    .returning();

  return row;
}

export async function findListingById(id: string, tx?: Tx) {
  return (tx ?? db).query.listings.findFirst({
    where: eq(listings.id, id),
  });
}

export interface UpsertFeedListingInput {
  externalId: string;
  source: string;
  url: string;
  title: string;
  description?: string;
  price?: number;
  acreage?: number;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  rawData: Record<string, unknown>;
}

export async function upsertFromFeed(input: UpsertFeedListingInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(listings)
    .values({
      id,
      externalId: input.externalId,
      source: input.source,
      url: input.url,
      title: input.title,
      description: input.description ?? null,
      price: input.price ?? null,
      acreage: input.acreage ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      county: input.county ?? null,
      state: input.state ?? null,
      rawData: input.rawData,
      enrichmentStatus: 'pending',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [listings.externalId, listings.source],
      set: {
        lastSeenAt: now,
        title: input.title,
        description: input.description ?? null,
        price: input.price ?? null,
        acreage: input.acreage ?? null,
      },
    })
    .returning();

  return row;
}

export async function findPendingEnrichment(limit: number, tx?: Tx) {
  return (tx ?? db)
    .select()
    .from(listings)
    .where(eq(listings.enrichmentStatus, 'pending'))
    .limit(limit);
}

export async function updateEnrichmentStatus(id: string, status: string, tx?: Tx) {
  await (tx ?? db)
    .update(listings)
    .set({ enrichmentStatus: status })
    .where(eq(listings.id, id));
}

export async function findListingWithEnrichment(id: string, tx?: Tx) {
  const listing = await (tx ?? db).query.listings.findFirst({
    where: eq(listings.id, id),
  });
  if (!listing) return null;

  const enrichment = await (tx ?? db).query.enrichments.findFirst({
    where: eq(enrichments.listingId, id),
  });

  return { listing, enrichment: enrichment ?? null };
}
