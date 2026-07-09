import argon2 from 'argon2';
import { ok, err, type Result, type AuthTokenResponseType } from '@landmatch/api';

import { captureError } from '../lib/captureError';
import { generateTokenPair, hashToken, refreshTokenExpiry, verifyToken } from '../lib/jwt';
import { generateId } from '../lib/id';
import { ERR } from '../lib/errors';
import { isUniqueViolation } from '../lib/pgErrors';
import * as refreshTokenRepo from '../repos/refreshTokenRepo';
import * as userRepo from '../repos/userRepo';

// Issue a token pair and record the refresh token server-side so it can be
// rotated, reuse-detected, and revoked. A fresh familyId starts a new session
// chain (login/register); rotation passes the existing one through.
async function issueTokens(userId: string, familyId: string = generateId()) {
  const tokens = await generateTokenPair(userId);
  await refreshTokenRepo.insert({
    userId,
    familyId,
    tokenHash: hashToken(tokens.refreshToken),
    expiresAt: refreshTokenExpiry(),
  });
  return tokens;
}

// OWASP-recommended argon2id baseline (19 MiB, 2 iterations, 1 lane) — lighter
// than the library defaults, which matters on the CPU-throttled 512 MB Lambda.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// A hash of a fixed dummy password, verified against when no user (or no
// password) is found so login spends the same hashing time whether or not the
// email exists — without it, an unknown email returns before any hashing and is
// measurably faster, leaking account existence via a timing side-channel.
// Derived from ARGON2_OPTIONS (not a hardcoded literal) so the work factor can
// never drift from real password hashes and silently reopen the oracle.
// Computed once at module load; resolved well before the first request.
const dummyHashPromise = argon2.hash('dummy-password-for-timing-equalization', ARGON2_OPTIONS);

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<Result<AuthTokenResponseType>> {
  try {
    const existing = await userRepo.findByEmail(email);
    if (existing) return err(ERR.EMAIL_ALREADY_EXISTS);

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    const user = await userRepo.insert({ email, name, passwordHash });

    const tokens = await issueTokens(user.id);
    return ok(tokens);
  } catch (e) {
    // Two concurrent registrations for the same email both pass the pre-check;
    // the loser trips the unique constraint. Map that to the same conflict the
    // pre-check returns, not a 500.
    if (isUniqueViolation(e)) return err(ERR.EMAIL_ALREADY_EXISTS);
    captureError(e, 'authService.register');
    return err(ERR.INTERNAL_ERROR);
  }
}

export async function login(
  email: string,
  password: string,
): Promise<Result<AuthTokenResponseType>> {
  try {
    const user = await userRepo.findByEmail(email);

    // Always run an argon2 verification — against the real hash if the user
    // exists, otherwise against a dummy — so response time doesn't reveal
    // whether the email is registered. A truthy `valid` is only possible on the
    // real branch. Stale pre-argon2 rows (bcrypt format) verify as false;
    // verify() can still throw on a truly malformed stored hash — treat that
    // as a failed match, not a 500.
    const valid = await argon2
      .verify(user?.passwordHash ?? (await dummyHashPromise), password)
      .catch(() => false);
    if (!user || !user.passwordHash || !valid) return err(ERR.INVALID_CREDENTIALS);

    // Bounded housekeeping: expired rows are useless for reuse detection.
    await refreshTokenRepo.deleteExpiredForUser(user.id);

    const tokens = await issueTokens(user.id);
    return ok(tokens);
  } catch (e) {
    captureError(e, 'authService.login');
    return err(ERR.INTERNAL_ERROR);
  }
}

export async function refresh(
  refreshToken: string,
): Promise<Result<AuthTokenResponseType>> {
  try {
    const payload = await verifyToken(refreshToken, 'refresh');
    if (!payload) return err(ERR.INVALID_REFRESH_TOKEN);

    // A valid signature is not enough — the token must be the live, un-rotated
    // record of its session. Tokens issued before server-side tracking have no
    // row and force a re-login.
    const record = await refreshTokenRepo.findByHash(hashToken(refreshToken));
    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      return err(ERR.INVALID_REFRESH_TOKEN);
    }

    // Rotation: consume exactly once. A token that was already exchanged
    // (rotatedAt set, or a concurrent exchange winning the race) is theft
    // evidence — an attacker and the real client are both holding it — so
    // revoke the entire session family.
    const consumed = await refreshTokenRepo.consume(record.id);
    if (!consumed) {
      await refreshTokenRepo.revokeFamily(record.familyId);
      return err(ERR.INVALID_REFRESH_TOKEN);
    }

    const user = await userRepo.findById(payload.sub);
    if (!user) return err(ERR.USER_NOT_FOUND);

    const tokens = await issueTokens(user.id, record.familyId);
    return ok(tokens);
  } catch (e) {
    captureError(e, 'authService.refresh');
    return err(ERR.INTERNAL_ERROR);
  }
}

export async function logout(refreshToken: string): Promise<Result<void>> {
  try {
    // Best-effort by design: an invalid/unknown token still returns ok so
    // logout never traps the user in a signed-in state client-side.
    const payload = await verifyToken(refreshToken, 'refresh');
    if (!payload) return ok(undefined);

    const record = await refreshTokenRepo.findByHash(hashToken(refreshToken));
    if (record) {
      await refreshTokenRepo.revokeFamily(record.familyId);
    }
    return ok(undefined);
  } catch (e) {
    captureError(e, 'authService.logout');
    return err(ERR.INTERNAL_ERROR);
  }
}
