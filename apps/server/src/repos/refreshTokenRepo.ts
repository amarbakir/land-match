import { and, eq, isNull, lte } from 'drizzle-orm';
import { refreshTokens } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertRefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function insert(input: InsertRefreshTokenInput, tx?: Tx) {
  const [row] = await (tx ?? db)
    .insert(refreshTokens)
    .values({ id: generateId(), ...input })
    .returning();
  return row;
}

export async function findByHash(tokenHash: string, tx?: Tx) {
  return (tx ?? db).query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  });
}

/**
 * Atomically mark a token as exchanged. Returns false when it was already
 * rotated or revoked — including a concurrent rotation racing this one — so
 * the caller treats that as reuse.
 */
export async function consume(id: string, tx?: Tx): Promise<boolean> {
  const rows = await (tx ?? db)
    .update(refreshTokens)
    .set({ rotatedAt: new Date() })
    .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.rotatedAt), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length > 0;
}

/** Revoke every token in a rotation chain (logout, or theft detected via reuse). */
export async function revokeFamily(familyId: string, tx?: Tx) {
  await (tx ?? db)
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/** Bounded per-user cleanup, run on login: expired rows are no longer needed for reuse detection. */
export async function deleteExpiredForUser(userId: string, tx?: Tx) {
  await (tx ?? db)
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), lte(refreshTokens.expiresAt, new Date())));
}
