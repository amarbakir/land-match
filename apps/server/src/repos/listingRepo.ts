import { eq, ne, lt, inArray, and, or, isNull, isNotNull, desc, asc, sql, getTableColumns, count as countFn, type SQL } from 'drizzle-orm';
import { listings, enrichments, savedListings, scores, searchProfiles } from '@landmatch/db';
import type { EnrichmentResult, EnrichmentStatus } from '@landmatch/enrichment';

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
  enrichmentStatus?: EnrichmentStatus;
}

export async function insertListing(input: InsertListingInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const rows = await (tx ?? db)
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
      enrichmentStatus: input.enrichmentStatus ?? 'pending',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    // listings_user_url_idx: one owned row per (user, url). A concurrent
    // insert for the same pair blocks until the winner commits, then lands
    // here — undefined tells the service to re-fetch the winner instead of
    // duplicating (land-match-ckt).
    .onConflictDoNothing({
      target: [listings.userId, listings.url],
      // The partial index's predicate — ON CONFLICT must name it to match.
      where: sql`${listings.url} IS NOT NULL AND ${listings.userId} IS NOT NULL`,
    })
    .returning();

  // undefined when a concurrent insert for the same (user_id, url) won.
  return rows.at(0);
}

// Visibility policy: ownerless (global feed) listings are visible to everyone;
// owned listings only to their owner. Module-private — user-facing read paths
// adopt it via the find* helpers below. Matching-side dual: searchProfileRepo
// .findActive scoped by listing owner (a policy change must update both).
function visibleTo(userId: string) {
  return or(isNull(listings.userId), eq(listings.userId, userId));
}

// Visibility-gated existence check: null when the listing doesn't exist OR
// belongs to another user — callers must not distinguish the two (that would
// leak ids). Projects id only; widen if a caller ever needs the row (rows
// carry raw_data jsonb blobs not worth shipping for a truthiness test).
export async function findVisibleListing(id: string, userId: string, tx?: Tx) {
  const row = await (tx ?? db).query.listings.findFirst({
    columns: { id: true },
    where: and(eq(listings.id, id), visibleTo(userId)),
  });
  return row ?? null;
}

// Rows that hit the cap leave the re-enrichment loop — a listing that can
// never enrich (bad coords, unmapped area) must not burn vendor quota on
// every run. Mirrored in the listings_reenrich_idx partial-index predicate
// (schema.ts). Lives here (not reEnrichmentService) so listingService can
// read it without a service-to-service import cycle.
export const MAX_ENRICHMENT_ATTEMPTS = 5;

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

// Dedupe-source lookup for POST /enrich: the newest row for this URL that has
// an enrichment row, ANY owner — deliberately bypasses visibleTo. Vendor-derived
// enrichment isn't user-private; the caller copies it into a row it owns
// (land-match-0jx.10) rather than surfacing this row to the user. Projects
// only what the copy needs from the listing side (rows carry raw_data jsonb
// blobs not worth shipping).
export async function findEnrichmentSourceByUrl(url: string, tx?: Tx) {
  const rows = await (tx ?? db)
    .select({
      listingId: listings.id,
      address: listings.address,
      latitude: listings.latitude,
      longitude: listings.longitude,
      enrichmentStatus: listings.enrichmentStatus,
      enrichment: { ...getTableColumns(enrichments) },
    })
    .from(listings)
    .innerJoin(enrichments, eq(enrichments.listingId, listings.id))
    .where(eq(listings.url, url))
    // Completeness beats recency: a partial copy made during yesterday's
    // vendor outage must not shadow months-old complete data for the URL.
    .orderBy(sql`(${listings.enrichmentStatus} = 'enriched') DESC, ${listings.firstSeenAt} DESC`)
    .limit(1);

  return rows.at(0) ?? null;
}

// Copy a source listing's enrichment verbatim onto another listing (fresh id).
// homestead_score rides along but the caller must recompute it — price/acreage
// belong to the listing, not the enrichment, and differ between the two rows.
export async function insertEnrichmentCopy(
  listingId: string,
  source: typeof enrichments.$inferSelect,
  tx?: Tx,
) {
  const { id: _id, listingId: _listingId, homesteadScore: _hs, ...data } = source;
  // homesteadScore is nulled, not copied: it belongs to the SOURCE listing's
  // price/acreage; updateHomesteadScore is the only writer of the real value.
  const values = { id: generateId(), listingId, homesteadScore: null, ...data };
  // No .returning(): every column is caller-supplied, nothing to read back.
  await (tx ?? db).insert(enrichments).values(values);
  return values;
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

  const values = {
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
  };

  // listing_id is unique — re-enrichment MERGES into the previous row: fresh
  // values win where this run produced data, previously-fetched values survive
  // where it didn't (a partial run must not erase what an earlier run got).
  // Deliberate trade-off: a source that now legitimately returns null (e.g.
  // FEMA "not mapped") keeps the old value rather than clearing it.
  // sources_used accumulates as a set; homestead_score is left for
  // persistEnrichment to recompute from the merged row.
  const { id: _id, listingId: _listingId, homesteadScore: _hs, ...dataColumns } = getTableColumns(enrichments);
  const mergeSet = Object.fromEntries(
    Object.entries(dataColumns).map(([key, col]) => {
      if (key === 'sourcesUsed') {
        return [key, sql`(SELECT array_agg(DISTINCT s) FROM unnest(coalesce(${enrichments.sourcesUsed}, '{}') || excluded.sources_used) AS s)`];
      }
      if (key === 'enrichedAt') return [key, sql`excluded.enriched_at`];
      return [key, sql`coalesce(${sql.raw(`excluded.${col.name}`)}, ${col})`];
    }),
  );

  const [row] = await (tx ?? db)
    .insert(enrichments)
    .values({ id, listingId, ...values })
    .onConflictDoUpdate({ target: enrichments.listingId, set: mergeSet })
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

// Candidates for the re-enrichment job: anything not fully enriched that still
// has retry budget and coordinates to enrich with. Oldest first so a backlog
// drains in FIFO order. Projects only what enrichment + homestead scoring
// need — rows carry raw_data jsonb blobs not worth shipping.
export async function findListingsNeedingEnrichment(limit: number, maxAttempts: number, tx?: Tx) {
  return (tx ?? db)
    .select({
      id: listings.id,
      latitude: listings.latitude,
      longitude: listings.longitude,
      price: listings.price,
      acreage: listings.acreage,
    })
    .from(listings)
    .where(
      and(
        ne(listings.enrichmentStatus, 'enriched'),
        lt(listings.enrichmentAttempts, maxAttempts),
        isNotNull(listings.latitude),
        isNotNull(listings.longitude),
      ),
    )
    .orderBy(asc(listings.firstSeenAt))
    .limit(limit);
}

export async function recordEnrichmentAttempt(
  id: string,
  status: EnrichmentStatus | undefined,
  tx?: Tx,
) {
  await (tx ?? db)
    .update(listings)
    .set({
      enrichmentAttempts: sql`${listings.enrichmentAttempts} + 1`,
      // No status means the run produced nothing worth persisting — keep the
      // existing status and only consume retry budget.
      ...(status ? { enrichmentStatus: status } : {}),
    })
    .where(eq(listings.id, id));
}

// The three by-id lookups below intentionally bypass visibleTo — their callers
// are system paths (matching, alert delivery, re-enrichment) that must see all
// listings. User-facing reads go through findVisibleListing / findByUrl.
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
  const dir = sortDir === 'asc' ? sql`ASC` : sql`DESC`;

  // Sortable value columns are nullable (unpriced feed listings, unscored
  // enrichments) — NULLS LAST in both directions so blanks trail instead of
  // leading (Postgres DESC defaults to NULLS FIRST). homestead_score is
  // persisted (backfilled), so its sort in SQL keeps pagination globally
  // ordered; saved_at tiebreak keeps page windows stable on value ties.
  const sortColumn = sort === 'homestead' ? enrichments.homesteadScore
    : sort === 'price' ? listings.price
    : sort === 'acreage' ? listings.acreage
    : null;
  const orderBy = sortColumn
    ? [sql`${sortColumn} ${dir} NULLS LAST`, desc(savedListings.savedAt)]
    : [sortDir === 'asc' ? asc(savedListings.savedAt) : desc(savedListings.savedAt)];

  // Subquery: the caller's single highest score per listing with its profile
  // name. Scoped to the caller's own profiles — listings are global, so
  // without the user_id filter this would surface other users' private
  // profile names and scores.
  const bestScoreSq = conn
    .selectDistinctOn([scores.listingId], {
      listingId: scores.listingId,
      bestScore: scores.overallScore,
      profileName: searchProfiles.name,
    })
    .from(scores)
    .innerJoin(searchProfiles, eq(scores.searchProfileId, searchProfiles.id))
    .where(eq(searchProfiles.userId, userId))
    // scores.id tie-breaker: without it, equal top scores from two profiles
    // make the returned profile name flip nondeterministically across requests.
    .orderBy(scores.listingId, desc(scores.overallScore), asc(scores.id))
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
      // visibleTo is a read-time backstop: the save path already gates on it,
      // but rows written before that gate (or through any future ungated
      // write) must not keep serving another user's listing + enrichment.
      .where(and(eq(savedListings.userId, userId), visibleTo(userId)))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    conn
      .select({ count: countFn() })
      .from(savedListings)
      .innerJoin(listings, eq(savedListings.listingId, listings.id))
      .where(and(eq(savedListings.userId, userId), visibleTo(userId))),
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
