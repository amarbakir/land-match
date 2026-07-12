import { describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

import { hashPassword, verifyPassword } from '../password';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: a hashed password verifies, a wrong one does not', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse battery stapl', hash)).resolves.toBe(false);
  });

  // Bug this catches: skipping the dummy verification when there's no stored
  // hash — unknown emails and OAuth-only accounts would respond measurably
  // faster than a wrong-password attempt, a timing oracle for account
  // enumeration.
  it('still performs an argon2 verification when no hash is stored', async () => {
    const verifySpy = vi.spyOn(argon2, 'verify');

    await expect(verifyPassword('password123', null)).resolves.toBe(false);
    await expect(verifyPassword('password123', undefined)).resolves.toBe(false);
    expect(verifySpy).toHaveBeenCalledTimes(2);

    verifySpy.mockRestore();
  });

  // Bug this catches: returning the raw argon2.verify result on the dummy
  // branch — an attacker submitting the dummy password verbatim against a
  // passwordless account would genuinely match the dummy hash and log in.
  it('never matches the dummy hash, even for the dummy password itself', async () => {
    await expect(
      verifyPassword('dummy-password-for-timing-equalization', null),
    ).resolves.toBe(false);
  });

  // Bug this catches: a stale pre-argon2 row (bcrypt format) making verify()
  // throw and login 500 instead of rejecting the credentials.
  it('treats a malformed stored hash as a failed match, not an error', async () => {
    await expect(
      verifyPassword('password123', '$2b$10$abcdefghijklmnopqrstuv'),
    ).resolves.toBe(false);
  });
});
