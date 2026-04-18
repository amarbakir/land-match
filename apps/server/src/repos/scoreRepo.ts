import { eq, and, desc, inArray } from 'drizzle-orm';
import { scores } from '@landmatch/db';

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
