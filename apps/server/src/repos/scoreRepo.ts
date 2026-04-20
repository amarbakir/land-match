import { eq, and, desc, asc, inArray, sql, gte, count as countFn } from 'drizzle-orm';
import { scores, listings, enrichments, searchProfiles } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertScoreInput {
  listingId: string;
  searchProfileId: string;
  overallScore: number;
  componentScores: Record<string, number>;
  llmSummary?: string;
}

export async function insert(input: InsertScoreInput, tx?: Tx) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(scores)
    .values({
      id,
      listingId: input.listingId,
      searchProfileId: input.searchProfileId,
      overallScore: input.overallScore,
      componentScores: input.componentScores,
      llmSummary: input.llmSummary ?? null,
      scoredAt: new Date(),
    })
    .returning();

  return row;
}

export async function findByListingAndProfile(listingId: string, profileId: string, tx?: Tx) {
  return (tx ?? db).query.scores.findFirst({
    where: and(eq(scores.listingId, listingId), eq(scores.searchProfileId, profileId)),
  });
}

export async function findScoredProfileIds(listingId: string, tx?: Tx): Promise<Set<string>> {
  const rows = await (tx ?? db)
    .select({ searchProfileId: scores.searchProfileId })
    .from(scores)
    .where(eq(scores.listingId, listingId));
  return new Set(rows.map((r) => r.searchProfileId));
}

export async function findByIds(ids: string[], tx?: Tx) {
  if (ids.length === 0) return [];
  return (tx ?? db).select().from(scores).where(inArray(scores.id, ids));
}

export async function findByProfileId(profileId: string, tx?: Tx) {
  return (tx ?? db)
    .select()
    .from(scores)
    .where(eq(scores.searchProfileId, profileId))
    .orderBy(desc(scores.overallScore));
}

export interface MatchQueryOptions {
  status?: string;
  minScore?: number;
  sort?: 'score' | 'date' | 'price' | 'acreage';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function findMatchesByProfile(profileId: string, opts: MatchQueryOptions = {}, tx?: Tx) {
  const { status, minScore = 0, sort = 'score', sortDir = 'desc', limit = 20, offset = 0 } = opts;
  const conn = tx ?? db;

  const conditions = [
    eq(scores.searchProfileId, profileId),
    gte(scores.overallScore, minScore),
  ];
  if (status) {
    conditions.push(eq(scores.status, status));
  }

  const orderMap = {
    score: scores.overallScore,
    date: scores.scoredAt,
    price: listings.price,
    acreage: listings.acreage,
  };
  const orderCol = orderMap[sort] ?? scores.overallScore;
  const orderDir = sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, totalResult] = await Promise.all([
    conn
      .select({
        scoreId: scores.id,
        listingId: scores.listingId,
        overallScore: scores.overallScore,
        componentScores: scores.componentScores,
        llmSummary: scores.llmSummary,
        status: scores.status,
        readAt: scores.readAt,
        scoredAt: scores.scoredAt,
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
      })
      .from(scores)
      .innerJoin(listings, eq(scores.listingId, listings.id))
      .leftJoin(enrichments, eq(listings.id, enrichments.listingId))
      .where(and(...conditions))
      .orderBy(orderDir)
      .limit(limit)
      .offset(offset),
    conn
      .select({ count: countFn() })
      .from(scores)
      .where(and(...conditions)),
  ]);

  return { rows, total: Number(totalResult[0]?.count ?? 0) };
}

export async function updateStatus(id: string, data: { status?: string; readAt?: Date }, tx?: Tx) {
  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.readAt !== undefined) updates.readAt = data.readAt;

  if (Object.keys(updates).length === 0) return null;

  const [row] = await (tx ?? db)
    .update(scores)
    .set(updates)
    .where(eq(scores.id, id))
    .returning();

  return row ?? null;
}

export async function getProfileCounts(profileIds: string[], tx?: Tx) {
  if (profileIds.length === 0) return [];

  const conn = tx ?? db;

  const rows = await conn
    .select({
      profileId: scores.searchProfileId,
      total: countFn(),
      unread: sql<number>`count(*) filter (where ${scores.readAt} is null and ${scores.status} = 'inbox')`,
      shortlisted: sql<number>`count(*) filter (where ${scores.status} = 'shortlisted')`,
      dismissed: sql<number>`count(*) filter (where ${scores.status} = 'dismissed')`,
    })
    .from(scores)
    .where(inArray(scores.searchProfileId, profileIds))
    .groupBy(scores.searchProfileId);

  return rows.map(r => ({
    profileId: r.profileId,
    total: Number(r.total),
    unread: Number(r.unread),
    shortlisted: Number(r.shortlisted),
    dismissed: Number(r.dismissed),
  }));
}

export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.scores.findFirst({
    where: eq(scores.id, id),
  });
}
