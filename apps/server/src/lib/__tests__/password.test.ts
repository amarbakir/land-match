import { describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

import { DUMMY_PASSWORD, hashPassword, verifyPassword } from '../password';

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
    // A real full-work-factor hash, not some cheap string that rejects at
    // parse time — a degenerate verification would keep the call count green
    // while reopening the timing oracle.
    expect(verifySpy.mock.calls[0][0]).toMatch(/^\$argon2id\$/);

    verifySpy.mockRestore();
  });

  // Bug this catches: returning the raw argon2.verify result on the dummy
  // branch — an attacker submitting the dummy password verbatim against a
  // passwordless account would genuinely match the dummy hash and log in.
  it('never matches the dummy hash, even for the dummy password itself', async () => {
    await expect(verifyPassword(DUMMY_PASSWORD, null)).resolves.toBe(false);
  });

  // Bugs this catches: a stale pre-argon2 row (bcrypt format) making verify()
  // throw and login 500 instead of rejecting the credentials — or resolving
  // instantly at parse time, which would leak which accounts hold
  // un-migrated hashes via response timing.
  it('treats a non-argon2 stored hash as a failed match, spending a dummy verification', async () => {
    const verifySpy = vi.spyOn(argon2, 'verify');

    await expect(
      verifyPassword('password123', '$2b$10$abcdefghijklmnopqrstuv'),
    ).resolves.toBe(false);
    // The bcrypt-format value never reaches argon2 — the one verification is
    // the full-work-factor dummy, keeping this branch timing-equalized.
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(verifySpy.mock.calls[0][0]).toMatch(/^\$argon2id\$/);

    verifySpy.mockRestore();
  });
});
