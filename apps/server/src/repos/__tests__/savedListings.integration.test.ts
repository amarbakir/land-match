import { describe, expect, it } from 'vitest';

import * as listingRepo from '../listingRepo';
import * as scoreRepo from '../scoreRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import { seedListing, seedUser } from './seed';

async function seedScoredProfile(userId: string, name: string, listingId: string, overallScore: number) {
  const profile = await searchProfileRepo.insert({
    userId,
    name,
    alertFrequency: 'daily',
    alertThreshold: 70,
    criteria: {},
    isActive: true,
  });
  await scoreRepo.insert({
    listingId,
    searchProfileId: profile.id,
    overallScore,
    componentScores: { soil: overallScore },
  });
}

describe('findSavedListings (integration)', () => {
  it('returns only the requesting user\'s saved listings', async () => {
    const [userA, userB] = await Promise.all([seedUser('a@example.com'), seedUser('b@example.com')]);
    const l1 = await seedListing('1 Rd', 30000, 10);
    const l2 = await seedListing('2 Rd', 20000, 40);
    await listingRepo.saveListing(userA, l1);
    await listingRepo.saveListing(userA, l2);
    await listingRepo.saveListing(userB, l1); // same listing, different user

    const forA = await listingRepo.findSavedListings(userA);
    const forB = await listingRepo.findSavedListings(userB);

    // Bug this catches: a missing user_id predicate would leak B's saved rows
    // into A's list (and vice versa).
    expect(forA.total).toBe(2);
    expect(forB.total).toBe(1);
    expect(forB.rows.map((r) => r.listingId)).toEqual([l1]);
  });

  it("bestScore never surfaces another user's profile name or score", async () => {
    // Bug this catches: listings are global, so an unscoped max(overall_score)
    // subquery leaks user A's private profile name (e.g. "Retirement land
    // near mom's") and score into user B's saved-listings response.
    const [userA, userB] = await Promise.all([seedUser('a@example.com'), seedUser('b@example.com')]);
    const listing = await seedListing('1 Rd', 30000, 10);
    await Promise.all([
      listingRepo.saveListing(userA, listing),
      listingRepo.saveListing(userB, listing),
      seedScoredProfile(userA, "Retirement land near mom's", listing, 95),
    ]);

    const forB = await listingRepo.findSavedListings(userB);
    expect(forB.rows[0].bestScoreValue).toBeNull();
    expect(forB.rows[0].bestScoreProfileName).toBeNull();

    const forA = await listingRepo.findSavedListings(userA);
    expect(forA.rows[0].bestScoreValue).toBe(95);
    expect(forA.rows[0].bestScoreProfileName).toBe("Retirement land near mom's");
  });

  it("bestScore picks the caller's own highest-scoring profile when both users scored the listing", async () => {
    // Bug this catches: scoping only the aggregate but not the name-lookup
    // subquery (or vice versa) — B would see their own score paired with A's
    // higher-scoring profile name.
    const [userA, userB] = await Promise.all([seedUser('a@example.com'), seedUser('b@example.com')]);
    const listing = await seedListing('1 Rd', 30000, 10);
    await Promise.all([
      listingRepo.saveListing(userB, listing),
      seedScoredProfile(userA, 'A private profile', listing, 99),
      seedScoredProfile(userB, 'B low', listing, 40),
      seedScoredProfile(userB, 'B high', listing, 80),
    ]);

    const forB = await listingRepo.findSavedListings(userB);
    expect(forB.rows[0].bestScoreValue).toBe(80);
    expect(forB.rows[0].bestScoreProfileName).toBe('B high');
  });

  it('paginates with a correct total independent of the page window', async () => {
    const userA = await seedUser('a@example.com');
    const ids = await Promise.all([
      seedListing('1 Rd', 10000, 5),
      seedListing('2 Rd', 20000, 5),
      seedListing('3 Rd', 30000, 5),
    ]);
    for (const id of ids) await listingRepo.saveListing(userA, id);

    const page1 = await listingRepo.findSavedListings(userA, { limit: 2, offset: 0 });
    const page2 = await listingRepo.findSavedListings(userA, { limit: 2, offset: 2 });

    // Bug this catches: computing total from the paged rows rather than a
    // separate count — total must reflect all 3 rows on every page.
    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(1);
  });

  it('sorts by homestead score in SQL so pagination is globally ordered, nulls last', async () => {
    // Bug this catches: ordering by saved_at in SQL and re-sorting each page
    // in memory — a higher-scored item saved later appears on page 2 below
    // lower-scored page-1 items, so "best first" silently lies across pages.
    const userA = await seedUser('a@example.com');
    const low = await seedListing('low', 10000, 5);
    const high = await seedListing('high', 20000, 5);
    const mid = await seedListing('mid', 30000, 5);
    const unscored = await seedListing('unscored', 40000, 5);
    const scores: Array<[string, number]> = [[low, 20], [high, 90], [mid, 55]];
    for (const [listingId, score] of scores) {
      await listingRepo.insertEnrichment(listingId, { sourcesUsed: ['usda-soil'], errors: [] });
      await listingRepo.updateHomesteadScore(listingId, score);
    }
    // Save order deliberately different from score order
    for (const id of [low, unscored, high, mid]) await listingRepo.saveListing(userA, id);

    const page1 = await listingRepo.findSavedListings(userA, { sort: 'homestead', sortDir: 'desc', limit: 2, offset: 0 });
    const page2 = await listingRepo.findSavedListings(userA, { sort: 'homestead', sortDir: 'desc', limit: 2, offset: 2 });

    expect(page1.rows.map((r) => r.homesteadScore)).toEqual([90, 55]);
    // Null-scored rows sort last regardless of direction, never interleaved
    expect(page2.rows.map((r) => r.homesteadScore)).toEqual([20, null]);

    const asc = await listingRepo.findSavedListings(userA, { sort: 'homestead', sortDir: 'asc', limit: 10 });
    expect(asc.rows.map((r) => r.homesteadScore)).toEqual([20, 55, 90, null]);
  });

  it('sorts by price in SQL (asc and desc)', async () => {
    const userA = await seedUser('a@example.com');
    const cheap = await seedListing('cheap', 20000, 5);
    const mid = await seedListing('mid', 30000, 5);
    const dear = await seedListing('dear', 50000, 5);
    for (const id of [mid, dear, cheap]) await listingRepo.saveListing(userA, id);

    const asc = await listingRepo.findSavedListings(userA, { sort: 'price', sortDir: 'asc' });
    const desc = await listingRepo.findSavedListings(userA, { sort: 'price', sortDir: 'desc' });

    expect(asc.rows.map((r) => r.price)).toEqual([20000, 30000, 50000]);
    expect(desc.rows.map((r) => r.price)).toEqual([50000, 30000, 20000]);
  });
});
