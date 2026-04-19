import bcrypt from 'bcryptjs';
import { ok, err, type Result } from '@landmatch/api';

import { generateTokenPair, verifyToken } from '../lib/jwt';
import { ERR } from '../lib/errors';
import * as userRepo from '../repos/userRepo';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const BCRYPT_ROUNDS = 12;

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<Result<TokenPair>> {
  const existing = await userRepo.findByEmail(email);
  if (existing) return err(ERR.EMAIL_ALREADY_EXISTS);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await userRepo.insert({ email, name, passwordHash });

  const tokens = await generateTokenPair(user.id);
  return ok(tokens);
}

export async function login(
  email: string,
  password: string,
): Promise<Result<TokenPair>> {
  const user = await userRepo.findByEmail(email);
  if (!user || !user.passwordHash) return err(ERR.INVALID_CREDENTIALS);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return err(ERR.INVALID_CREDENTIALS);

  const tokens = await generateTokenPair(user.id);
  return ok(tokens);
}

export async function refresh(
  refreshToken: string,
): Promise<Result<TokenPair>> {
  const payload = await verifyToken(refreshToken, 'refresh');
  if (!payload) return err(ERR.INVALID_REFRESH_TOKEN);

  const user = await userRepo.findById(payload.sub);
  if (!user) return err(ERR.USER_NOT_FOUND);

  const tokens = await generateTokenPair(user.id);
  return ok(tokens);
}
