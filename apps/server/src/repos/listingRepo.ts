import { eq, inArray, and, or, isNull, desc, asc, sql, count as countFn, type SQL } from 'drizzle-orm';
import { listings, enrichments, savedListings, scores, searchProfiles } from '@landmatch/db';
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
  source?: string;
  externalId?: string;
  userId?: string;
}

export async function insertListing(input: InsertListingInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(listings)
    .values({
      id,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      price: input.price ?? null,
      acreage: input.acreage ?? null,
      url: input.url ?? null,
      title: input.title ?? null,
      userId: input.userId ?? null,
      enrichmentStatus: 'enriched',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning();

  return row;
}

// Visibility policy: ownerless (global feed) listings are visible to everyone;
// owned listings only to their owner. Module-private for now — export it when
// other read paths adopt the policy (land-match-9vs).
function visibleTo(userId: string) {
  return or(isNull(listings.userId), eq(listings.userId, userId));
}

async function findOneWithEnrichment(where: SQL | undefined, tx?: Tx, orderBy?: SQL) {
  const query = (tx ?? db)
    .select()
    .from(listings)
    .leftJoin(enrichments, eq(enrichments.listingId, listings.id))
    .where(where);
  const rows = await (orderBy ? query.orderBy(orderBy) : query).limit(1);

  if (rows.length === 0) return null;
  return { listing: rows[0].listings, enrichment: rows[0].enrichments };
}

export async function findByUrl(url: string, userId: string, tx?: Tx) {
  return findOneWithEnrichment(
    and(eq(listings.url, url), visibleTo(userId)),
    tx,
    // Multiple visible rows can share a URL (the caller's own + an ownerless
    // feed row). Prefer the caller's own listing, then the newest.
    sql`${listings.userId} IS NULL, ${listings.firstSeenAt} DESC`,
  );
}

export async function saveListing(userId: string, listingId: string, tx?: Tx) {
  const id = generateId();
  const [row] = await (tx ?? db)
    .insert(savedListings)
    .values({ id, userId, listingId })
    .onConflictDoNothing()
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
      // Climate normals (PRISM)
      frostFreeDays: result.climateNormals?.frostFreeDays ?? null,
      annualPrecipIn: result.climateNormals?.annualPrecipIn ?? null,
      avgMinTempF: result.climateNormals?.avgMinTempF ?? null,
      avgMaxTempF: result.climateNormals?.avgMaxTempF ?? null,
      growingSeasonDays: result.climateNormals?.growingSeasonDays ?? null,
      // Elevation (3DEP)
      elevationFt: result.elevation?.elevationFt ?? null,
      slopePct: result.elevation?.slopePct ?? null,
      // Wetlands (NWI)
      wetlandType: result.wetlands?.wetlandType ?? null,
      wetlandDescription: result.wetlands?.wetlandDescription ?? null,
      wetlandWithinBufferFt: result.wetlands?.distanceFt === Infinity ? null : (result.wetlands?.distanceFt ?? null),
      enrichedAt: new Date(),
      sourcesUsed: result.sourcesUsed,
    })
    .returning();

  return row;
}

export async function updateHomesteadScore(
  listingId: string,
  score: number | null,
  tx?: Tx,
) {
  await (tx ?? db)
    .update(enrichments)
    .set({ homesteadScore: score })
    .where(eq(enrichments.listingId, listingId));
}

export async function findListingById(id: string, tx?: Tx) {
  return (tx ?? db).query.listings.findFirst({
    where: eq(listings.id, id),
  });
}

export async function findByIds(ids: string[], tx?: Tx) {
  if (ids.length === 0) return [];
  return (tx ?? db).select().from(listings).where(inArray(listings.id, ids));
}

export async function findListingWithEnrichment(id: string, tx?: Tx) {
  return findOneWithEnrichment(eq(listings.id, id), tx);
}

export interface SavedListingsQuery {
  sort?: 'date' | 'homestead' | 'price' | 'acreage';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function findSavedListings(userId: string, opts: SavedListingsQuery = {}, tx?: Tx) {
  const { sort = 'date', sortDir = 'desc', limit = 20, offset = 0 } = opts;
  const conn = tx ?? db;
  const dir = sortDir === 'asc' ? asc : desc;

  const orderColumn = sort === 'price' ? listings.price
    : sort === 'acreage' ? listings.acreage
    : savedListings.savedAt; // 'date' and 'homestead' both default to savedAt (homestead sorted in service layer)

  // Subquery: highest score per listing with the corresponding profile name.
  // Scoped to the caller's own profiles — listings are global, so without the
  // user_id filter this would surface other users' private profile names and
  // scores.
  const bestScoreSq = conn
    .select({
      listingId: scores.listingId,
      bestScore: sql<number>`max(${scores.overallScore})`.as('best_score'),
      profileName: sql<string>`(
        SELECT sp2.name FROM search_profiles sp2
        JOIN scores s2 ON s2.search_profile_id = sp2.id
        WHERE s2.listing_id = ${scores.listingId} AND sp2.user_id = ${userId}
        ORDER BY s2.overall_score DESC LIMIT 1
      )`.as('profile_name'),
    })
    .from(scores)
    .innerJoin(searchProfiles, eq(scores.searchProfileId, searchProfiles.id))
    .where(eq(searchProfiles.userId, userId))
    .groupBy(scores.listingId)
    .as('best_score_sq');

  const [rows, totalResult] = await Promise.all([
    conn
      .select({
        id: savedListings.id,
        savedAt: savedListings.savedAt,
        listingId: savedListings.listingId,
        title: listings.title,
        address: listings.address,
        price: listings.price,
        acreage: listings.acreage,
        source: listings.source,
        url: listings.url,
        lat: listings.latitude,
        lng: listings.longitude,
        soilClass: enrichments.soilCapabilityClass,
        floodZone: enrichments.femaFloodZone,
        zoning: enrichments.zoningCode,
        homesteadScore: enrichments.homesteadScore,
        soilDrainageClass: enrichments.soilDrainageClass,
        soilTexture: enrichments.soilTexture,
        fireRiskScore: enrichments.fireRiskScore,
        floodRiskScore: enrichments.floodRiskScore,
        frostFreeDays: enrichments.frostFreeDays,
        annualPrecipIn: enrichments.annualPrecipIn,
        avgMinTempF: enrichments.avgMinTempF,
        avgMaxTempF: enrichments.avgMaxTempF,
        growingSeasonDays: enrichments.growingSeasonDays,
        elevationFt: enrichments.elevationFt,
        slopePct: enrichments.slopePct,
        wetlandType: enrichments.wetlandType,
        wetlandWithinBufferFt: enrichments.wetlandWithinBufferFt,
        bestScoreValue: bestScoreSq.bestScore,
        bestScoreProfileName: bestScoreSq.profileName,
      })
      .from(savedListings)
      .innerJoin(listings, eq(savedListings.listingId, listings.id))
      .leftJoin(enrichments, eq(enrichments.listingId, listings.id))
      .leftJoin(bestScoreSq, eq(bestScoreSq.listingId, listings.id))
      .where(eq(savedListings.userId, userId))
      .orderBy(dir(orderColumn))
      .limit(limit)
      .offset(offset),
    conn
      .select({ count: countFn() })
      .from(savedListings)
      .where(eq(savedListings.userId, userId)),
  ]);

  return { rows, total: Number(totalResult[0]?.count ?? 0) };
}

export async function unsaveListing(userId: string, listingId: string, tx?: Tx) {
  const result = await (tx ?? db)
    .delete(savedListings)
    .where(and(eq(savedListings.userId, userId), eq(savedListings.listingId, listingId)))
    .returning();

  return result.length > 0;
}
