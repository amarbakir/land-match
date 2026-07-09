import { describe, expect, it } from 'vitest';

import { pool } from '../../db/client';
import * as alertRepo from '../alertRepo';
import * as scoreRepo from '../scoreRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import { seedListing, seedUser } from './seed';

async function seedProfile(userId: string) {
  return searchProfileRepo.insert({
    userId,
    name: 'Race profile',
    alertFrequency: 'instant',
    alertThreshold: 70,
    criteria: {},
    isActive: true,
  });
}

describe('score/alert uniqueness (integration)', () => {
  it('concurrent duplicate score inserts converge to one row instead of duplicating', async () => {
    // Bug this catches: check-then-insert with no unique constraint — two
    // concurrent enrichments of one listing both saw "not scored" and both
    // inserted, yielding duplicate scores and duplicate alert emails.
    const userId = await seedUser('race@example.com');
    const profile = await seedProfile(userId);
    const listingId = await seedListing('1 Race Rd, MO');

    const input = {
      listingId,
      searchProfileId: profile.id,
      overallScore: 80,
      componentScores: { soil: 80 },
    };
    const [first, second] = await Promise.all([scoreRepo.insert(input), scoreRepo.insert(input)]);

    // Exactly one wins; the loser reports null rather than throwing
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM scores');
    expect(rows[0].n).toBe(1);
  });

  it('duplicate alert inserts for the same score+channel converge to one row', async () => {
    const userId = await seedUser('race2@example.com');
    const profile = await seedProfile(userId);
    const listingId = await seedListing('2 Race Rd, MO');
    const score = await scoreRepo.insert({
      listingId,
      searchProfileId: profile.id,
      overallScore: 80,
      componentScores: { soil: 80 },
    });

    const input = {
      userId,
      searchProfileId: profile.id,
      listingId,
      scoreId: score!.id,
      channel: 'email' as const,
    };
    const [first, second] = await Promise.all([alertRepo.insert(input), alertRepo.insert(input)]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM alerts');
    expect(rows[0].n).toBe(1);
  });
});
