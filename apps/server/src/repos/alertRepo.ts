import { eq, and, or, inArray, desc, lte } from 'drizzle-orm';
import { alerts, users, searchProfiles } from '@landmatch/db';
import type { AlertChannel } from '@landmatch/api';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertAlertInput {
  userId: string;
  searchProfileId: string;
  listingId: string;
  scoreId: string;
  channel: AlertChannel;
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

// A crashed worker leaves its claims in 'processing'; after this long they
// become claimable again.
const STALE_CLAIM_MS = 15 * 60_000;

/**
 * Atomically claim every deliverable alert for this worker. FOR UPDATE SKIP
 * LOCKED means two workers running concurrently (scaled Fargate tasks,
 * overlapping cron invocations) partition the pending set instead of both
 * claiming — and double-sending — the same alerts.
 */
export async function claimPending(tx?: Tx): Promise<string[]> {
  const claimable = (tx ?? db)
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      or(
        eq(alerts.status, 'pending'),
        and(eq(alerts.status, 'processing'), lte(alerts.claimedAt, new Date(Date.now() - STALE_CLAIM_MS))),
      ),
    )
    .for('update', { skipLocked: true });

  const rows = await (tx ?? db)
    .update(alerts)
    .set({ status: 'processing', claimedAt: new Date() })
    .where(inArray(alerts.id, claimable))
    .returning({ id: alerts.id });

  return rows.map((r) => r.id);
}

/** Put claimed alerts back in the pending pool (e.g. digest window not yet elapsed). */
export async function releaseClaims(alertIds: string[], tx?: Tx) {
  if (alertIds.length === 0) return;
  await (tx ?? db)
    .update(alerts)
    .set({ status: 'pending', claimedAt: null })
    .where(inArray(alerts.id, alertIds));
}

export async function findClaimedWithDetails(alertIds: string[], tx?: Tx) {
  if (alertIds.length === 0) return [];
  return (tx ?? db)
    .select({
      alertId: alerts.id,
      listingId: alerts.listingId,
      scoreId: alerts.scoreId,
      userId: alerts.userId,
      searchProfileId: alerts.searchProfileId,
      createdAt: alerts.createdAt,
      userEmail: users.email,
      userName: users.name,
      profileName: searchProfiles.name,
      alertFrequency: searchProfiles.alertFrequency,
    })
    .from(alerts)
    .innerJoin(users, eq(users.id, alerts.userId))
    .innerJoin(searchProfiles, eq(searchProfiles.id, alerts.searchProfileId))
    .where(inArray(alerts.id, alertIds))
    .orderBy(alerts.userId, alerts.searchProfileId, alerts.createdAt);
}

export async function findLastSentAt(userId: string, searchProfileId: string, tx?: Tx) {
  const row = await (tx ?? db)
    .select({ sentAt: alerts.sentAt })
    .from(alerts)
    .where(
      and(
        eq(alerts.userId, userId),
        eq(alerts.searchProfileId, searchProfileId),
        eq(alerts.status, 'sent'),
      ),
    )
    .orderBy(desc(alerts.sentAt))
    .limit(1);

  return row[0]?.sentAt ?? null;
}

export async function markSent(alertIds: string[], tx?: Tx) {
  await (tx ?? db)
    .update(alerts)
    .set({ status: 'sent', sentAt: new Date() })
    .where(inArray(alerts.id, alertIds));
}

export async function markFailed(alertIds: string[], tx?: Tx) {
  await (tx ?? db)
    .update(alerts)
    .set({ status: 'failed' })
    .where(inArray(alerts.id, alertIds));
}
