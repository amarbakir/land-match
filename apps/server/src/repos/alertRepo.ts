import { eq, and, or, inArray, desc, gt, lt, lte, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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

/**
 * Inserts an alert; returns null when one already exists for this
 * score+channel (unique index) — concurrent matching runs can't double-email.
 */
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
    .onConflictDoNothing({ target: [alerts.scoreId, alerts.channel] })
    .returning();

  return row ?? null;
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

// A crashed worker leaves its claims in 'processing'; after this long they
// become claimable again. Invariant: this must stay comfortably ABOVE the
// longest possible delivery run (the AlertDelivery Lambda timeout in
// sst.config.ts) or a slow-but-alive worker gets its claims stolen and the
// user is emailed twice.
const STALE_CLAIM_MS = 15 * 60_000;

// One run claims at most this many user+profile groups (one email each); the
// 5-minute cadence drains any backlog incrementally. Unbounded claims + a big
// backlog would blow the Lambda timeout and leave everything stuck in
// 'processing' for STALE_CLAIM_MS, stalling delivery entirely. Bounding by
// group, not alert, keeps one group's digest from splitting across batches.
const CLAIM_GROUP_BATCH_SIZE = 500;

// Transient failures release back to pending with attempts+1; past this many
// attempts an alert is terminally 'failed'. Enforced both where failures are
// classified (delivery service) and here at the claim boundary, so an
// exhausted alert can never re-enter delivery regardless of who released it.
export const MAX_SEND_ATTEMPTS = 5;

/**
 * Atomically claim every deliverable alert for this worker, whole user+profile
 * groups at a time. FOR UPDATE SKIP LOCKED means two workers running
 * concurrently (scaled Fargate tasks, overlapping cron invocations) partition
 * the pending set instead of both claiming — and double-sending — the same
 * alerts.
 *
 * Eligibility lives here, not just in the delivery service: a digest group
 * whose frequency window hasn't elapsed since its last send is not claimed at
 * all (previously every 5-minute run claimed and released it — 2 row UPDATEs
 * per waiting alert per cycle). A group another live worker is mid-delivery on
 * is skipped whole, so a late-arriving alert can't split one window's digest
 * into two emails. The service's isWindowElapsed re-check stays as the
 * backstop for claim-to-send races.
 */
export async function claimPending(tx?: Tx): Promise<string[]> {
  const conn = tx ?? db;
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS);

  const claimable = and(
    // The delivery service sends email only — claiming sms/push alerts
    // would email opted-out users and consume the alert for its real channel.
    eq(alerts.channel, 'email'),
    lt(alerts.attempts, MAX_SEND_ATTEMPTS),
    or(
      eq(alerts.status, 'pending'),
      and(eq(alerts.status, 'processing'), lte(alerts.claimedAt, staleCutoff)),
    ),
  );

  // No 'sent' alert for this group inside its frequency window. 'instant'
  // short-circuits; unknown frequencies fall to interval '0' (always due),
  // matching the service's isWindowElapsed.
  const sentInWindow = alias(alerts, 'sent_in_window');
  const windowElapsed = or(
    eq(searchProfiles.alertFrequency, 'instant'),
    notExists(
      conn
        .select({ one: sql`1` })
        .from(sentInWindow)
        .where(
          and(
            eq(sentInWindow.userId, alerts.userId),
            eq(sentInWindow.searchProfileId, alerts.searchProfileId),
            eq(sentInWindow.status, 'sent'),
            sql`${sentInWindow.sentAt} > now() - (CASE ${searchProfiles.alertFrequency} WHEN 'daily' THEN interval '24 hours' WHEN 'weekly' THEN interval '7 days' ELSE interval '0' END)`,
          ),
        ),
    ),
  );

  // No live (non-stale) claim on any alert of this group by another worker.
  const liveClaim = alias(alerts, 'live_claim');
  const groupIdle = notExists(
    conn
      .select({ one: sql`1` })
      .from(liveClaim)
      .where(
        and(
          eq(liveClaim.userId, alerts.userId),
          eq(liveClaim.searchProfileId, alerts.searchProfileId),
          eq(liveClaim.status, 'processing'),
          gt(liveClaim.claimedAt, staleCutoff),
        ),
      ),
  );

  const groups = conn
    .select({ userId: alerts.userId, searchProfileId: alerts.searchProfileId })
    .from(alerts)
    .innerJoin(searchProfiles, eq(searchProfiles.id, alerts.searchProfileId))
    .where(and(claimable, windowElapsed, groupIdle))
    .groupBy(alerts.userId, alerts.searchProfileId)
    // FIFO by each group's oldest alert: a backlog bigger than the batch must
    // not starve old groups indefinitely.
    .orderBy(sql`min(${alerts.createdAt})`)
    .limit(CLAIM_GROUP_BATCH_SIZE)
    .as('claim_groups');

  const claimableIds = conn
    .select({ id: alerts.id })
    .from(alerts)
    .innerJoin(
      groups,
      and(eq(alerts.userId, groups.userId), eq(alerts.searchProfileId, groups.searchProfileId)),
    )
    .where(claimable)
    .for('update', { of: alerts, skipLocked: true });

  const rows = await conn
    .update(alerts)
    .set({ status: 'processing', claimedAt: new Date() })
    .where(inArray(alerts.id, claimableIds))
    .returning({ id: alerts.id });

  return rows.map((r) => r.id);
}

/**
 * Put claimed alerts back in the pending pool. Guarded on
 * status='processing': if this worker's stale claims were stolen and already
 * delivered by another worker, an unguarded release would flip 'sent' back to
 * 'pending' and queue a duplicate email. Single implementation for both
 * release flavors so the guard can't drift between them.
 */
async function releaseToPending(alertIds: string[], countAttempt: boolean, tx?: Tx) {
  if (alertIds.length === 0) return;
  await (tx ?? db)
    .update(alerts)
    .set({
      status: 'pending',
      claimedAt: null,
      ...(countAttempt ? { attempts: sql`${alerts.attempts} + 1` } : {}),
    })
    .where(and(inArray(alerts.id, alertIds), eq(alerts.status, 'processing')));
}

/** Release without consuming retry budget (e.g. digest window not yet elapsed). */
export async function releaseClaims(alertIds: string[], tx?: Tx) {
  return releaseToPending(alertIds, false, tx);
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
      attempts: alerts.attempts,
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

/** Transient delivery failure: release with one more attempt on the books. */
export async function releaseForRetry(alertIds: string[], tx?: Tx) {
  return releaseToPending(alertIds, true, tx);
}

export async function markFailed(alertIds: string[], tx?: Tx) {
  if (alertIds.length === 0) return;
  await (tx ?? db)
    .update(alerts)
    .set({ status: 'failed' })
    // Same stolen-claim guard as releaseClaims: never overwrite a 'sent'
    // record written by the worker that took over this claim.
    .where(and(inArray(alerts.id, alertIds), eq(alerts.status, 'processing')));
}
