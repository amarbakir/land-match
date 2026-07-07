import { eq, sql } from 'drizzle-orm';
import { users } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertUserInput {
  email: string;
  name?: string;
  passwordHash: string;
}

export async function insert(input: InsertUserInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(users)
    .values({
      id,
      email: input.email,
      name: input.name ?? null,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function findByEmail(email: string, tx?: Tx) {
  // Case-insensitive match. New emails are normalized to lowercase at the API
  // boundary, but rows written before that (mixed case) must still match on
  // login and on the register pre-check so they aren't locked out or duplicated.
  return (tx ?? db).query.users.findFirst({
    where: sql`lower(${users.email}) = ${email.toLowerCase()}`,
  });
}

export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.users.findFirst({
    where: eq(users.id, id),
  });
}

export async function updateNotificationPrefs(
  userId: string,
  prefs: Record<string, unknown>,
  tx?: Tx,
) {
  const [row] = await (tx ?? db)
    .update(users)
    .set({ notificationPrefs: prefs, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return row ?? null;
}
