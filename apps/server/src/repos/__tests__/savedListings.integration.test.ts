import { describe, expect, it } from 'vitest';

import * as listingRepo from '../listingRepo';
import * as userRepo from '../userRepo';

async function seedUser(email: string) {
  const user = await userRepo.insert({ email, passwordHash: 'not-a-real-hash' });
  return user.id;
}

async function seedListing(address: string, price: number, acreage: number) {
  const row = await listingRepo.insertListing({ address, latitude: 36.6, longitude: -92.1, price, acreage });
  return row.id;
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
