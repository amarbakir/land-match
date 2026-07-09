import { describe, expect, it } from 'vitest';

import { pool } from '../../db/client';
import * as alertRepo from '../alertRepo';
import * as listingRepo from '../listingRepo';
import * as scoreRepo from '../scoreRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import * as userRepo from '../userRepo';

async function seedPendingAlert(n: number) {
  const user = await userRepo.insert({ email: `alerts-${n}@example.com`, passwordHash: 'not-a-real-hash' });
  const profile = await searchProfileRepo.insert({
    userId: user.id,
    name: `Profile ${n}`,
    alertFrequency: 'instant',
    alertThreshold: 70,
    criteria: {},
    isActive: true,
  });
  const listing = await listingRepo.insertListing({
    address: `${n} Alert Rd, MO`,
    latitude: 36.6,
    longitude: -92.1,
  });
  const score = await scoreRepo.insert({
    listingId: listing.id,
    searchProfileId: profile.id,
    overallScore: 80,
    componentScores: { soil: 80 },
  });
  const alert = await alertRepo.insert({
    userId: user.id,
    searchProfileId: profile.id,
    listingId: listing.id,
    scoreId: score.id,
    channel: 'email',
  });
  return alert.id;
}

describe('alert claiming (integration)', () => {
  it('concurrent claim calls never claim the same alert twice', async () => {
    // Bug this catches: the double-send — two delivery workers (scaled Fargate
    // tasks or overlapping cron invocations) both reading the same pending
    // alerts and both emailing the user. FOR UPDATE SKIP LOCKED partitions.
    const ids = await Promise.all([1, 2, 3, 4].map(seedPendingAlert));

    const [claimA, claimB] = await Promise.all([
      alertRepo.claimPending(),
      alertRepo.claimPending(),
    ]);

    const union = new Set([...claimA, ...claimB]);
    expect(union.size).toBe(claimA.length + claimB.length); // no overlap
    expect([...union].sort()).toEqual([...ids].sort()); // nothing dropped
  });

  it('reclaims alerts stranded in processing by a crashed worker, but not fresh claims', async () => {
    const staleId = await seedPendingAlert(1);
    const freshId = await seedPendingAlert(2);
    await pool.query(
      `UPDATE alerts SET status = 'processing', claimed_at = now() - interval '20 minutes' WHERE id = $1`,
      [staleId],
    );
    await pool.query(
      `UPDATE alerts SET status = 'processing', claimed_at = now() WHERE id = $1`,
      [freshId],
    );

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
});
