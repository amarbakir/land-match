import * as listingRepo from '../listingRepo';
import * as userRepo from '../userRepo';

// Shared DB seed primitives for repo integration tests — keep schema-shape
// knowledge (required columns, fixture defaults) in one place.

export async function seedUser(email: string) {
  const user = await userRepo.insert({ email, passwordHash: 'not-a-real-hash' });
  return user.id;
}

export async function seedListing(address: string, price?: number, acreage?: number) {
  const row = await listingRepo.insertListing({ address, latitude: 36.6, longitude: -92.1, price, acreage });
  return row.id;
}
