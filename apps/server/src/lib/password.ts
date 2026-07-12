import argon2 from 'argon2';

import { captureError } from './captureError';

// OWASP-recommended argon2id baseline (19 MiB, 2 iterations, 1 lane) — lighter
// than the library defaults, which matters on the CPU-throttled 512 MB Lambda.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// The fixed password behind the dummy hash. Exported so the test proving it
// can never log anyone in stays pinned to the real value.
export const DUMMY_PASSWORD = 'dummy-password-for-timing-equalization';

// A hash of the dummy password, verified against when the caller has no
// usable stored hash so a login attempt spends the same hashing time whether
// or not the account exists — without it, those paths return before any
// hashing and are measurably faster, leaking account existence via a timing
// side-channel. Derived from ARGON2_OPTIONS (not a hardcoded literal) so the
// work factor can never drift from real password hashes and silently reopen
// the oracle. Computed once at module load; resolved well before the first
// request.
const dummyHashPromise = argon2.hash(DUMMY_PASSWORD, ARGON2_OPTIONS);
// A load-time hashing failure must surface as failed logins on the affected
// paths (verifyPassword re-awaits and degrades), not as an unhandled rejection
// that kills the whole process before any route runs.
dummyHashPromise.catch((e) => captureError(e, 'password: dummy hash computation failed'));

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Timing-equalized verify: a match is only ever possible against a real,
// well-formed stored hash. Every other outcome — no stored hash (unknown
// email, OAuth-only account) or a malformed one (stale bcrypt-era row) —
// still spends a full argon2 verification against the dummy hash before
// returning false, so response time doesn't reveal whether (or in what state)
// the account exists.
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  // A non-argon2 stored value (stale bcrypt-era row, corrupted data) resolves
  // or rejects at parse time, before the memory-hard work — route it to the
  // dummy verification below so it isn't measurably faster than a wrong
  // password. The catch covers argon2-prefixed values that still fail to
  // parse.
  if (hash?.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // fall through to the dummy verification
    }
  }
  try {
    await argon2.verify(await dummyHashPromise, password);
  } catch {
    // Dummy hash unavailable (load-time failure, captured above) — degrade to
    // an immediate rejection rather than a thrown 500, which would make
    // unknown emails distinguishable from real accounts by response code.
  }
  return false;
}
