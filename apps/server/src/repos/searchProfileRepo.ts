import { and, eq } from 'drizzle-orm';
import { searchProfiles } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertSearchProfileInput {
  userId: string;
  name: string;
  alertFrequency: string;
  alertThreshold: number;
  criteria: Record<string, unknown>;
  isActive: boolean;
}

export async function insert(input: InsertSearchProfileInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(searchProfiles)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      alertFrequency: input.alertFrequency,
      alertThreshold: input.alertThreshold,
      criteria: input.criteria,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findFirst({
    where: eq(searchProfiles.id, id),
  });
}

export async function findByUserId(userId: string, tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findMany({
    where: eq(searchProfiles.userId, userId),
  });
}

// listingOwnerId scopes matching to the visibility policy (listingRepo.visibleTo):
// an owned listing only matches its owner's profiles; ownerless (feed) listings
// match every user's (pass null).
export async function findActive(listingOwnerId: string | null, tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findMany({
    where: listingOwnerId === null
      ? eq(searchProfiles.isActive, true)
      : and(eq(searchProfiles.isActive, true), eq(searchProfiles.userId, listingOwnerId)),
  });
}

export async function update(id: string, data: Partial<InsertSearchProfileInput>, tx?: Tx) {
  const [row] = await (tx ?? db)
    .update(searchProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(searchProfiles.id, id))
    .returning();

  return row ?? null;
}

export async function deleteById(id: string, tx?: Tx) {
  const [row] = await (tx ?? db)
    .delete(searchProfiles)
    .where(eq(searchProfiles.id, id))
    .returning();

  return row ?? null;
}
