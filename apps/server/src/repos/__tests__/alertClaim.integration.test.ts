import type { AlertChannel } from '@landmatch/api';
import { alerts } from '@landmatch/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client';
import * as alertRepo from '../alertRepo';
import * as scoreRepo from '../scoreRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import { seedListing, seedUser } from './seed';

async function seedPendingAlert(n: number, channel: AlertChannel = 'email') {
  const userId = await seedUser(`alerts-${n}@example.com`);
  const profile = await searchProfileRepo.insert({
    userId,
    name: `Profile ${n}`,
    alertFrequency: 'instant',
    alertThreshold: 70,
    criteria: {},
    isActive: true,
  });
  const listingId = await seedListing(`${n} Alert Rd, MO`);
  const score = await scoreRepo.insert({
    listingId,
    searchProfileId: profile.id,
    overallScore: 80,
    componentScores: { soil: 80 },
  });
  const alert = await alertRepo.insert({
    userId,
    searchProfileId: profile.id,
    listingId,
    scoreId: score.id,
    channel,
  });
  return alert.id;
}

function setClaimState(alertId: string, claimedAt: Date) {
  return db.update(alerts).set({ status: 'processing', claimedAt }).where(eq(alerts.id, alertId));
}

describe('alert claiming (integration)', () => {
  it('concurrent claim calls never claim the same alert twice', async () => {
    // Bug this catches: the double-send — two delivery workers (scaled Fargate
    // tasks or overlapping cron invocations) both reading the same pending
    // alerts and both emailing the user. FOR UPDATE SKIP LOCKED partitions.
    const ids = await Promise.all([1, 2, 3, 4].map((n) => seedPendingAlert(n)));

    const [claimA, claimB] = await Promise.all([
      alertRepo.claimPending(),
      alertRepo.claimPending(),
    ]);

    const union = new Set([...claimA, ...claimB]);
    expect(union.size).toBe(claimA.length + claimB.length); // no overlap
    expect([...union].sort()).toEqual([...ids].sort()); // nothing dropped
  });

  it('claims only email alerts — sms/push alerts must not be consumed by the email path', async () => {
    // Bug this catches: the delivery service is email-only; claiming an sms
    // alert emails a user who opted out of email AND permanently consumes the
    // alert for its real channel.
    await seedPendingAlert(1, 'sms');
    const emailId = await seedPendingAlert(2, 'email');

    expect(await alertRepo.claimPending()).toEqual([emailId]);
  });

  it('reclaims alerts stranded in processing by a crashed worker, but not fresh claims', async () => {
    const staleId = await seedPendingAlert(1);
    const freshId = await seedPendingAlert(2);
    await setClaimState(staleId, new Date(Date.now() - 20 * 60_000));
    await setClaimState(freshId, new Date());

    const claimed = await alertRepo.claimPending();

    // Bug this catches: a worker dying mid-delivery leaving its alerts
    // permanently invisible (stuck 'processing' forever).
    expect(claimed).toContain(staleId);
    // Bug this catches: reclaiming an active worker's alerts → double-send.
    expect(claimed).not.toContain(freshId);
  });

  it('released claims become claimable again', async () => {
    const id = await seedPendingAlert(1);

    const first = await alertRepo.claimPending();
    expect(first).toEqual([id]);
    expect(await alertRepo.claimPending()).toEqual([]); // claimed → not claimable

    await alertRepo.releaseClaims([id]);

    expect(await alertRepo.claimPending()).toEqual([id]);
  });

  it('releaseClaims never regresses an alert another worker already sent', async () => {
    // Bug this catches: a stalled worker whose stale claim was stolen and
    // delivered calls releaseClaims afterwards — an unguarded release would
    // flip 'sent' back to 'pending' and queue a duplicate email.
    const id = await seedPendingAlert(1);
    await alertRepo.claimPending();
    await alertRepo.markSent([id]); // the stealing worker delivered

    await alertRepo.releaseClaims([id]); // the stalled worker's late release

    expect(await alertRepo.claimPending()).toEqual([]); // stays sent
  });
});

describe('releaseForRetry (integration)', () => {
  it('returns alerts to pending with one more attempt on the books, re-claimable next run', async () => {
    // Bug this catches: transient failures marked alerts 'failed' and nothing
    // ever re-claims 'failed' — the notification was silently dropped forever.
    const id = await seedPendingAlert(1);
    expect(await alertRepo.claimPending()).toEqual([id]);

    await alertRepo.releaseForRetry([id]);

    const [row] = await db.select().from(alerts).where(eq(alerts.id, id));
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.claimedAt).toBeNull();
    // The next delivery run picks it up again
    expect(await alertRepo.claimPending()).toEqual([id]);
  });

  it('does not clobber an alert another worker already sent (stolen-claim guard)', async () => {
    const id = await seedPendingAlert(1);
    await alertRepo.claimPending();
    // Another worker stole the stale claim and delivered it
    await db.update(alerts).set({ status: 'sent' }).where(eq(alerts.id, id));

    await alertRepo.releaseForRetry([id]);

    const [row] = await db.select().from(alerts).where(eq(alerts.id, id));
    expect(row.status).toBe('sent'); // never flipped back to pending → no duplicate email
    expect(row.attempts).toBe(0);
  });
});
