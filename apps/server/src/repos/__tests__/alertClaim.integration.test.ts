import type { AlertChannel } from '@landmatch/api';
import { alerts } from '@landmatch/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../../db/client';
import * as alertRepo from '../alertRepo';
import * as scoreRepo from '../scoreRepo';
import { seedListing, seedProfile, seedUser } from './seed';

interface AlertGroup {
  userId: string;
  profileId: string;
  n: number;
  alertCount: number;
}

// One user+profile — the unit the delivery service groups into a single email.
async function seedGroup(n: number, alertFrequency: 'instant' | 'daily' | 'weekly' = 'instant'): Promise<AlertGroup> {
  const userId = await seedUser(`alerts-${n}@example.com`);
  const profileId = await seedProfile(userId, { name: `Profile ${n}`, alertFrequency });
  return { userId, profileId, n, alertCount: 0 };
}

// Each alert gets its own listing+score (scores are unique per listing+profile).
// sentAt backdates the alert to an already-delivered send for window tests.
async function addAlert(group: AlertGroup, opts: { channel?: AlertChannel; sentAt?: Date } = {}) {
  group.alertCount += 1;
  const listingId = await seedListing(`${group.n}-${group.alertCount} Alert Rd, MO`);
  const score = await scoreRepo.insert({
    listingId,
    searchProfileId: group.profileId,
    overallScore: 80,
    componentScores: { soil: 80 },
  });
  const alert = await alertRepo.insert({
    userId: group.userId,
    searchProfileId: group.profileId,
    listingId,
    scoreId: score!.id,
    channel: opts.channel ?? 'email',
  });
  if (opts.sentAt) {
    await db.update(alerts).set({ status: 'sent', sentAt: opts.sentAt }).where(eq(alerts.id, alert!.id));
  }
  return alert!.id;
}

async function seedPendingAlert(n: number, channel: AlertChannel = 'email') {
  return addAlert(await seedGroup(n), { channel });
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
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

describe('digest eligibility at the claim boundary', () => {
  // Bug these catch: every 5-minute run claimed ALL pending alerts including
  // digests whose window hadn't elapsed, then released them — ~576 pointless
  // claim/release row-update pairs while a daily digest waits (land-match-7y8).

  it('skips a daily-digest group whose window has not elapsed', async () => {
    const g = await seedGroup(1, 'daily');
    await addAlert(g, { sentAt: hoursAgo(1) });
    await addAlert(g); // pending, but not due for ~23h

    expect(await alertRepo.claimPending()).toEqual([]);
  });

  it('claims a daily-digest group once 24h have elapsed since the last send', async () => {
    const g = await seedGroup(1, 'daily');
    await addAlert(g, { sentAt: hoursAgo(25) });
    const due = await addAlert(g);

    expect(await alertRepo.claimPending()).toEqual([due]);
  });

  it('weekly digests wait seven days, not 24 hours', async () => {
    const notDue = await seedGroup(1, 'weekly');
    await addAlert(notDue, { sentAt: hoursAgo(3 * 24) });
    await addAlert(notDue);

    const due = await seedGroup(2, 'weekly');
    await addAlert(due, { sentAt: hoursAgo(8 * 24) });
    const dueId = await addAlert(due);

    expect(await alertRepo.claimPending()).toEqual([dueId]);
  });

  it('instant alerts claim regardless of a recent send', async () => {
    const g = await seedGroup(1, 'instant');
    await addAlert(g, { sentAt: hoursAgo(0.01) });
    const pending = await addAlert(g);

    expect(await alertRepo.claimPending()).toEqual([pending]);
  });
});

describe('group-integrity claiming', () => {
  it('does not claim a new alert for a group a live worker is already processing', async () => {
    // Bug this catches: an alert arriving mid-delivery gets claimed by a second
    // run; both runs pass the window check before either marks sent → the user
    // gets two partial digests in the same window (land-match-7y8 comment).
    const g = await seedGroup(1, 'instant');
    const first = await addAlert(g);
    expect(await alertRepo.claimPending()).toEqual([first]);

    await addAlert(g); // arrives while the first claim is still live

    expect(await alertRepo.claimPending()).toEqual([]);
  });

  it('claims the whole group, stale claim included, once the claim goes stale', async () => {
    const g = await seedGroup(1, 'instant');
    const first = await addAlert(g);
    await alertRepo.claimPending();
    await setClaimState(first, new Date(Date.now() - 20 * 60_000)); // worker died
    const second = await addAlert(g);

    const claimed = await alertRepo.claimPending();

    expect(claimed.sort()).toEqual([first, second].sort());
  });
});

describe('retry-budget exhaustion at the claim boundary', () => {
  it('never claims an alert whose retry budget is exhausted', async () => {
    // Bug this catches: the exhaustion check living only in the delivery
    // service's catch block — any other path that releases an exhausted alert
    // back to pending would have it re-claimed and retried forever.
    const spent = await seedPendingAlert(1);
    const fresh = await seedPendingAlert(2);
    await db.update(alerts).set({ attempts: 5 }).where(eq(alerts.id, spent));

    expect(await alertRepo.claimPending()).toEqual([fresh]);
  });
});
