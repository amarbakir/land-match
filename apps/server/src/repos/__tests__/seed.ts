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

export async function seedListing(
  address: string,
  price?: number,
  acreage?: number,
  enrichmentStatus?: 'enriched' | 'partial' | 'failed',
) {
  const row = await listingRepo.insertListing({ address, ...FIXTURE_COORDS, price, acreage, enrichmentStatus });
  return row.id;
}

// Owned (user-enriched) listing — private to its owner under the visibility policy.
export async function seedOwnedListing(address: string, userId: string) {
  const row = await listingRepo.insertListing({ address, ...FIXTURE_COORDS, userId });
  return row.id;
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
