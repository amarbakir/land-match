import { eq, and } from 'drizzle-orm';
import { alerts } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertAlertInput {
  userId: string;
  searchProfileId: string;
  listingId: string;
  scoreId: string;
  channel: string;
}

export async function insert(input: InsertAlertInput, tx?: Tx) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(alerts)
    .values({
      id,
      userId: input.userId,
      searchProfileId: input.searchProfileId,
      listingId: input.listingId,
      scoreId: input.scoreId,
      channel: input.channel,
      status: 'pending',
      createdAt: new Date(),
    })
    .returning();

  return row;
}

export async function findByListingAndProfile(listingId: string, profileId: string, tx?: Tx) {
  return (tx ?? db).query.alerts.findFirst({
    where: and(eq(alerts.listingId, listingId), eq(alerts.searchProfileId, profileId)),
  });
}

export async function findAlertedProfileIds(listingId: string, tx?: Tx): Promise<Set<string>> {
  const rows = await (tx ?? db)
    .select({ searchProfileId: alerts.searchProfileId })
    .from(alerts)
    .where(eq(alerts.listingId, listingId));
  return new Set(rows.map((r) => r.searchProfileId));
}

export async function findPendingByUser(userId: string, tx?: Tx) {
  return (tx ?? db).query.alerts.findMany({
    where: and(eq(alerts.userId, userId), eq(alerts.status, 'pending')),
  });
}
