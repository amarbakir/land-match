import * as listingRepo from '../listingRepo';
import * as searchProfileRepo from '../searchProfileRepo';
import * as userRepo from '../userRepo';

// Shared DB seed primitives for repo integration tests — keep schema-shape
// knowledge (required columns, fixture defaults) in one place.

const FIXTURE_COORDS = { latitude: 36.6, longitude: -92.1 };

export async function seedUser(email: string) {
  const user = await userRepo.insert({ email, passwordHash: 'not-a-real-hash' });
  return user.id;
}

// The standard two-party fixture for cross-tenant tests.
export function seedTwoUsers() {
  return Promise.all([seedUser('a@example.com'), seedUser('b@example.com')]);
}

// Seeds never deliberately collide with the (user_id, url) unique index — an
// undefined insert result here is a broken fixture, so fail loudly. Tests that
// WANT the conflict call listingRepo.insertListing directly.
async function insertSeedListing(input: listingRepo.InsertListingInput) {
  const row = await listingRepo.insertListing(input);
  if (!row) throw new Error('seed insert unexpectedly hit the (user_id, url) unique index');
  return row;
}

export async function seedListing(
  address: string,
  price?: number,
  acreage?: number,
  enrichmentStatus?: 'enriched' | 'partial' | 'failed',
) {
  const row = await insertSeedListing({ address, ...FIXTURE_COORDS, price, acreage, enrichmentStatus });
  return row.id;
}

// Owned (user-enriched) listing — private to its owner under the visibility policy.
export async function seedOwnedListing(address: string, userId: string) {
  const row = await insertSeedListing({ address, ...FIXTURE_COORDS, userId });
  return row.id;
}

// Listing carrying a URL — the dedupe key for POST /enrich (land-match-0jx.10).
// Ownerless unless a userId is given. Returns the full row.
export async function seedUrlListing(
  url: string,
  userId?: string,
  enrichmentStatus?: 'enriched' | 'partial' | 'failed',
) {
  return insertSeedListing({ address: '1 Dedupe Rd, MO', ...FIXTURE_COORDS, url, userId, enrichmentStatus });
}

export async function seedProfile(
  userId: string,
  opts: { name?: string; isActive?: boolean; alertFrequency?: 'instant' | 'daily' | 'weekly' } = {},
) {
  const row = await searchProfileRepo.insert({
    userId,
    name: opts.name ?? 'Test profile',
    alertFrequency: opts.alertFrequency ?? 'daily',
    alertThreshold: 70,
    criteria: {},
    isActive: opts.isActive ?? true,
  });
  return row.id;
}
