import { describe, expect, it } from 'vitest';

import * as listingRepo from '../listingRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import { seedListing, seedOwnedListing, seedProfile, seedTwoUsers } from './seed';

// The visibility policy (ownerless listings are shared, owned listings are
// private to their owner) lives in SQL where-clauses. Unit tests mock the
// repos, so only these tests can catch a broken or missing predicate.

describe('findVisibleListing (integration)', () => {
  it("returns null for another user's listing, same as a nonexistent id", async () => {
    // Bug this catches: a missing/wrong visibleTo predicate lets any
    // authenticated user save an id they learned elsewhere and read the full
    // row + enrichment via GET /saved (land-match-9vs).
    const [owner, other] = await seedTwoUsers();
    const listingId = await seedOwnedListing('1 Private Rd', owner);

    expect(await listingRepo.findVisibleListing(listingId, other)).toBeUndefined();
    expect(await listingRepo.findVisibleListing('lst-nonexistent', other)).toBeUndefined();
  });

  it('returns owned listings to their owner and ownerless listings to anyone', async () => {
    const [owner, other] = await seedTwoUsers();
    const ownedId = await seedOwnedListing('1 Private Rd', owner);
    const feedId = await seedListing('2 Feed Rd');

    expect((await listingRepo.findVisibleListing(ownedId, owner))?.id).toBe(ownedId);
    expect((await listingRepo.findVisibleListing(feedId, other))?.id).toBe(feedId);
  });
});

describe('findActive profile scoping (integration)', () => {
  it("scoped lookup returns only the owner's active profiles", async () => {
    // Bug this catches: a broken owner predicate re-leaks user A's enriched
    // listing to user B via matches and alert emails (land-match-9vs).
    const [userA, userB] = await seedTwoUsers();
    const activeA = await seedProfile(userA, { name: 'A active' });
    await Promise.all([
      seedProfile(userA, { name: 'A inactive', isActive: false }),
      seedProfile(userB, { name: 'B active' }),
    ]);

    const profiles = await searchProfileRepo.findActive(userA);

    expect(profiles.map((p) => p.id)).toEqual([activeA]);
  });

  it('unscoped lookup (ownerless listing) returns active profiles across users', async () => {
    const [userA, userB] = await seedTwoUsers();
    await Promise.all([
      seedProfile(userA, { name: 'A active' }),
      seedProfile(userB, { name: 'B active' }),
      seedProfile(userB, { name: 'B inactive', isActive: false }),
    ]);

    const profiles = await searchProfileRepo.findActive(null);

    expect(profiles.map((p) => p.name).sort()).toEqual(['A active', 'B active']);
  });
});
