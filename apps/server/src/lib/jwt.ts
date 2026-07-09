import { createHash } from 'crypto';

import { SignJWT, jwtVerify } from 'jose';

import { auth } from '../config';
import { generateId } from './id';

type TokenType = 'access' | 'refresh';

let _secret: Uint8Array;
function getSecret() {
  return (_secret ??= new TextEncoder().encode(auth.jwtSecret));
}

/** Parse duration string like "15m", "1h", "30d" into seconds. */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

let _accessExpiresIn: number;
function getAccessExpiresIn() {
  return (_accessExpiresIn ??= parseDuration(auth.jwtExpiresIn));
}

function getExpiration(type: TokenType): string {
  return type === 'access' ? auth.jwtExpiresIn : `${auth.refreshTokenExpiresInDays}d`;
}

export async function signToken(userId: string, type: TokenType): Promise<string> {
  return new SignJWT({ type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    // jti makes same-second tokens for one user distinct — refresh tokens are
    // stored server-side by hash, which must be unique per token.
    .setJti(generateId())
    .setIssuedAt()
    .setExpirationTime(getExpiration(type))
    .sign(getSecret());
}

/** Server-side fingerprint of a refresh token — the raw token is never stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Reads the same config field the JWT exp claim is built from, so the DB
// record and the token can't disagree about when a refresh token dies.
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + auth.refreshTokenExpiresInDays * 86_400_000);
}

export async function verifyToken(
  token: string,
  expectedType: TokenType,
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== expectedType || !payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export async function generateTokenPair(userId: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(userId, 'access'),
    signToken(userId, 'refresh'),
  ]);

  return { accessToken, refreshToken, expiresIn: getAccessExpiresIn() };
}
