import { eq } from 'drizzle-orm';
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
  return (tx ?? db).query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.users.findFirst({
    where: eq(users.id, id),
  });
}
