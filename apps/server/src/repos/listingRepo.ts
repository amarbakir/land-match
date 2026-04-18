import { eq, inArray } from 'drizzle-orm';
import { listings, enrichments } from '@landmatch/db';
import type { EnrichmentResult } from '@landmatch/enrichment';
import type { RawListing } from '@landmatch/feeds';

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

export async function upsertFromFeed(input: RawListing, tx?: Tx) {
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

export type EnrichmentStatus = 'pending' | 'enriched' | 'complete' | 'failed';

export async function updateEnrichmentStatus(id: string, status: EnrichmentStatus, tx?: Tx) {
  await (tx ?? db)
    .update(listings)
    .set({ enrichmentStatus: status })
    .where(eq(listings.id, id));
}

export async function findByIds(ids: string[], tx?: Tx) {
  if (ids.length === 0) return [];
  return (tx ?? db).select().from(listings).where(inArray(listings.id, ids));
}

export async function findListingWithEnrichment(id: string, tx?: Tx) {
  const rows = await (tx ?? db)
    .select()
    .from(listings)
    .leftJoin(enrichments, eq(enrichments.listingId, listings.id))
    .where(eq(listings.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  return { listing: rows[0].listings, enrichment: rows[0].enrichments };
}
