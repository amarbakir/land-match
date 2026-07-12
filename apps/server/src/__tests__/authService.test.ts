import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as userRepo from '../repos/userRepo';
import * as refreshTokenRepo from '../repos/refreshTokenRepo';
import * as jwt from '../lib/jwt';
import * as password from '../lib/password';
import { db } from '../db/client';
import { register, login, refresh, logout } from '../services/authService';

vi.mock('../repos/userRepo');
vi.mock('../repos/refreshTokenRepo');
vi.mock('../lib/jwt');
vi.mock('../lib/password');
vi.mock('../db/client', () => ({
  db: { transaction: vi.fn() },
}));

const mockUserRepo = vi.mocked(userRepo);
const mockRefreshRepo = vi.mocked(refreshTokenRepo);
const mockJwt = vi.mocked(jwt);
const mockPassword = vi.mocked(password);

const LIVE_RECORD = {
  id: 'rt-1',
  userId: 'user-1',
  familyId: 'fam-1',
  tokenHash: 'hash-1',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
  rotatedAt: null,
  revokedAt: null,
};

const TOKEN_PAIR = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresIn: 900,
};

const STORED_USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test',
  phone: null,
  authProvider: 'email',
  passwordHash: 'stored-argon2-hash',
  subscriptionTier: 'free',
  notificationPrefs: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  // Transactions execute their callback with a fake tx handle
  vi.mocked(db.transaction).mockImplementation(async (cb) => cb('fake-tx' as never));
  mockJwt.generateTokenPair.mockResolvedValue(TOKEN_PAIR);
  mockJwt.hashToken.mockReturnValue('hash-1');
  mockJwt.refreshTokenExpiry.mockReturnValue(new Date(Date.now() + 30 * 86_400_000));
  mockRefreshRepo.consume.mockResolvedValue(true);
  mockRefreshRepo.deleteExpiredForUser.mockResolvedValue(undefined);
  mockPassword.hashPassword.mockResolvedValue('argon2-hash-of-password');
  // Rejecting is the default; tests that log in successfully opt in.
  mockPassword.verifyPassword.mockResolvedValue(false);
});

describe('register', () => {
  it('creates user and returns tokens when email is new', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);
    mockUserRepo.insert.mockResolvedValue(STORED_USER);

    const result = await register('new@example.com', 'password123', 'New User');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    // Bug this catches: storing the raw password instead of hashPassword's
    // output. (That the hash itself is sound is lib/password.ts's contract.)
    expect(mockPassword.hashPassword).toHaveBeenCalledWith('password123');
    const insertCall = mockUserRepo.insert.mock.calls[0][0];
    expect(insertCall.email).toBe('new@example.com');
    expect(insertCall.passwordHash).toBe('argon2-hash-of-password');
  });

  // Bug: if hashing or DB throws, service should degrade to INTERNAL_ERROR, not crash the request
  it('returns INTERNAL_ERROR when insert throws', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);
    mockUserRepo.insert.mockRejectedValue(new Error('DB connection lost'));

    const result = await register('new@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
  });

  it('rejects duplicate email without attempting insert', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(STORED_USER);

    const result = await register('test@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_EXISTS' });
    expect(mockUserRepo.insert).not.toHaveBeenCalled();
  });

  // Bug this catches: two concurrent registrations both pass the pre-check, then
  // the loser trips the unique constraint. Without mapping SQLSTATE 23505 this
  // surfaces as a confusing 500 instead of the same EMAIL_ALREADY_EXISTS the
  // pre-check would have returned.
  it('maps a unique-violation race on insert to EMAIL_ALREADY_EXISTS', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined); // pre-check passes
    mockUserRepo.insert.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

    const result = await register('race@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'EMAIL_ALREADY_EXISTS' });
  });
});

describe('login', () => {
  it('returns tokens when password matches', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(STORED_USER);
    mockPassword.verifyPassword.mockResolvedValue(true);

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    // Verifies the candidate against the STORED hash — not a re-hash, not
    // some other field.
    expect(mockPassword.verifyPassword).toHaveBeenCalledWith('password123', STORED_USER.passwordHash);
    expect(mockJwt.generateTokenPair).toHaveBeenCalledWith(STORED_USER.id);
  });

  it('rejects wrong password without leaking whether email exists', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(STORED_USER);

    const result = await login('test@example.com', 'wrongpassword');

    // Same error code as nonexistent user — no email enumeration
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
  });

  // Bug this catches: an early `if (!user) return` (the pre-cge.4 behavior)
  // skips verification entirely for unknown emails, so they respond measurably
  // faster than a wrong-password attempt — a timing oracle for account
  // enumeration. The dummy-hash equalization itself is lib/password.ts's
  // contract; the service's job is to reach verifyPassword unconditionally,
  // with the same error either way.
  it('rejects an unknown email with the same error, still spending a verification', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);

    const result = await login('nobody@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(mockPassword.verifyPassword).toHaveBeenCalledWith('password123', undefined);
  });

  // Same side-channel for OAuth accounts that have no password hash: must not
  // short-circuit before the verification.
  it('rejects a passwordless (OAuth) user without skipping verification', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ ...STORED_USER, passwordHash: null });

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(mockPassword.verifyPassword).toHaveBeenCalledWith('password123', null);
  });
});

describe('refresh', () => {
  it('rotates: returns a new pair, consumes the old record, and keeps the family', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue(LIVE_RECORD);

    const result = await refresh('valid-refresh-token');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    expect(mockRefreshRepo.consume).toHaveBeenCalledWith('rt-1', 'fake-tx');
    // Bug this catches: starting a new family on rotation would break reuse
    // detection across the chain.
    expect(mockRefreshRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
      'fake-tx',
    );
  });

  it('rejects an invalid/expired refresh token', async () => {
    mockJwt.verifyToken.mockResolvedValue(null);

    const result = await refresh('expired-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockUserRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects a validly-signed token with no server-side record', async () => {
    // Bug this catches: trusting the JWT signature alone — the pre-rotation
    // world where a stolen token stayed valid for 30 days with no recourse.
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue(undefined);

    const result = await refresh('signed-but-untracked-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('rejects a revoked token without consuming it', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue({ ...LIVE_RECORD, revokedAt: new Date() });

    const result = await refresh('revoked-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockRefreshRepo.consume).not.toHaveBeenCalled();
  });

  it('treats reuse of a token rotated a while ago as theft and revokes the family', async () => {
    // Bug this catches: reuse without family revocation — an attacker who
    // stole and rotated the token keeps a live session while the real user's
    // failed refresh looks like a transient error.
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue({ ...LIVE_RECORD, rotatedAt: new Date(Date.now() - 10 * 60_000) });
    mockRefreshRepo.consume.mockResolvedValue(false); // already exchanged

    const result = await refresh('reused-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-1');
    expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('does not revoke the family when reuse follows rotation within the grace window', async () => {
    // Bug this catches: two browser tabs sharing one stored refresh token both
    // refreshing after access-token expiry — the loser must get a 401, not
    // hard-log the user out of every tab by killing the family.
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue({ ...LIVE_RECORD, rotatedAt: new Date(Date.now() - 2_000) });
    mockRefreshRepo.consume.mockResolvedValue(false);

    const result = await refresh('racing-tab-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
  });

  // Bug: if DB throws during refresh, should not crash
  it('returns INTERNAL_ERROR when the store throws', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue(LIVE_RECORD);
    mockRefreshRepo.consume.mockRejectedValue(new Error('DB timeout'));

    const result = await refresh('valid-token');

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
  });
});

describe('logout', () => {
  it('revokes the whole session family for a known token', async () => {
    mockRefreshRepo.findByHash.mockResolvedValue(LIVE_RECORD);

    const result = await logout('valid-refresh-token');

    expect(result.ok).toBe(true);
    expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-1');
  });

  it('succeeds quietly for an unknown token — logout must never trap the user signed in', async () => {
    mockRefreshRepo.findByHash.mockResolvedValue(undefined);

    const result = await logout('garbage');

    expect(result.ok).toBe(true);
    expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
  });
});
