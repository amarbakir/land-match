import bcrypt from 'bcrypt';
import { ok, err, type Result, type AuthTokenResponseType } from '@landmatch/api';

import { captureError } from '../lib/captureError';
import { generateTokenPair, verifyToken } from '../lib/jwt';
import { ERR } from '../lib/errors';
import { isUniqueViolation } from '../lib/pgErrors';
import * as userRepo from '../repos/userRepo';

const BCRYPT_ROUNDS = 12;

// A hash of a fixed dummy password, compared against when no user (or no
// password) is found so login spends the same bcrypt time whether or not the
// email exists — without it, an unknown email returns before any hashing and is
// measurably faster, leaking account existence via a timing side-channel.
// Derived from BCRYPT_ROUNDS (not a hardcoded literal) so the work factor can
// never drift from real password hashes and silently reopen the oracle.
// Computed once at module load; resolved well before the first request.
const dummyHashPromise = bcrypt.hash('dummy-password-for-timing-equalization', BCRYPT_ROUNDS);

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<Result<AuthTokenResponseType>> {
  try {
    const existing = await userRepo.findByEmail(email);
    if (existing) return err(ERR.EMAIL_ALREADY_EXISTS);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await userRepo.insert({ email, name, passwordHash });

    const tokens = await generateTokenPair(user.id);
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

    // Always run a bcrypt comparison — against the real hash if the user exists,
    // otherwise against a dummy — so response time doesn't reveal whether the
    // email is registered. A truthy `valid` is only possible on the real branch.
    const valid = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHashPromise));
    if (!user || !user.passwordHash || !valid) return err(ERR.INVALID_CREDENTIALS);

    const tokens = await generateTokenPair(user.id);
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

    const user = await userRepo.findById(payload.sub);
    if (!user) return err(ERR.USER_NOT_FOUND);

    const tokens = await generateTokenPair(user.id);
    return ok(tokens);
  } catch (e) {
    captureError(e, 'authService.refresh');
    return err(ERR.INTERNAL_ERROR);
  }
}
