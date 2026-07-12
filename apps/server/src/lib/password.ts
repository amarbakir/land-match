import argon2 from 'argon2';

// OWASP-recommended argon2id baseline (19 MiB, 2 iterations, 1 lane) — lighter
// than the library defaults, which matters on the CPU-throttled 512 MB Lambda.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// A hash of a fixed dummy password, verified against when the caller has no
// stored hash (unknown email, OAuth-only account) so a login attempt spends
// the same hashing time whether or not the account exists — without it, those
// paths return before any hashing and are measurably faster, leaking account
// existence via a timing side-channel. Derived from ARGON2_OPTIONS (not a
// hardcoded literal) so the work factor can never drift from real password
// hashes and silently reopen the oracle. Computed once at module load;
// resolved well before the first request.
const dummyHashPromise = argon2.hash('dummy-password-for-timing-equalization', ARGON2_OPTIONS);

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Timing-equalized verify: when `hash` is absent, verifies against the dummy
// hash and always returns false — a match is only ever possible against a real
// stored hash. Stale pre-argon2 rows (bcrypt format) verify as false; verify()
// can still throw on a truly malformed stored hash — treated as a failed
// match, not an error.
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const valid = await argon2
    .verify(hash ?? (await dummyHashPromise), password)
    .catch(() => false);
  return hash != null && valid;
}
