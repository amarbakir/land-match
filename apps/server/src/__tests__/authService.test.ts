import { beforeEach, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

import * as userRepo from '../repos/userRepo';
import * as refreshTokenRepo from '../repos/refreshTokenRepo';
import * as jwt from '../lib/jwt';
import { register, login, refresh, logout } from '../services/authService';

vi.mock('../repos/userRepo');
vi.mock('../repos/refreshTokenRepo');
vi.mock('../lib/jwt');

const mockUserRepo = vi.mocked(userRepo);
const mockRefreshRepo = vi.mocked(refreshTokenRepo);
const mockJwt = vi.mocked(jwt);

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
  // Real argon2id hash of "password123" with the service's production params
  passwordHash:
    '$argon2id$v=19$m=19456,t=2,p=1$Mqgxad6Tx4P47ud7uj246Q$Y33F8hmVA3/5JtaiAanufqf7tr62/TblrZdNXB9vDtk',
  subscriptionTier: 'free',
  notificationPrefs: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  mockJwt.generateTokenPair.mockResolvedValue(TOKEN_PAIR);
  mockJwt.hashToken.mockReturnValue('hash-1');
  mockJwt.refreshTokenExpiry.mockReturnValue(new Date(Date.now() + 30 * 86_400_000));
  mockRefreshRepo.consume.mockResolvedValue(true);
});

describe('register', () => {
  it('creates user and returns tokens when email is new', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);
    mockUserRepo.insert.mockResolvedValue(STORED_USER);

    const result = await register('new@example.com', 'password123', 'New User');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    // Verify password was hashed (not stored in plain text)
    const insertCall = mockUserRepo.insert.mock.calls[0][0];
    expect(insertCall.email).toBe('new@example.com');
    expect(insertCall.passwordHash).not.toBe('password123');
    expect(insertCall.passwordHash).toMatch(/^\$argon2id\$/);
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
    // STORED_USER carries a real argon2id hash of "password123" made with the
    // service's production params — a real verification, not a stubbed one.
    mockUserRepo.findByEmail.mockResolvedValue(STORED_USER);

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    expect(mockJwt.generateTokenPair).toHaveBeenCalledWith(STORED_USER.id);
  });

  it('rejects wrong password without leaking whether email exists', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(STORED_USER);

    const result = await login('test@example.com', 'wrongpassword');

    // Same error code as nonexistent user — no email enumeration
    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('rejects nonexistent email with same error as wrong password', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);

    const result = await login('nobody@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });

  // Bug this catches: an early `if (!user) return` (the pre-cge.4 behavior) skips
  // hashing entirely for unknown emails, so they respond measurably faster than a
  // wrong-password attempt — a timing oracle for account enumeration. Login must
  // spend an argon2 verification even when the email doesn't exist.
  it('still performs an argon2 verification when the email is unknown (constant-time)', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(undefined);
    const compareSpy = vi.spyOn(argon2, 'verify');

    const result = await login('nobody@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(compareSpy).toHaveBeenCalledTimes(1);
    // never a truthy match against the dummy hash
    await expect(compareSpy.mock.results[0].value).resolves.toBe(false);

    compareSpy.mockRestore();
  });

  // Same side-channel for OAuth accounts that have no password hash: must not
  // short-circuit before the comparison.
  it('still performs an argon2 verification for a passwordless (OAuth) user', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ ...STORED_USER, passwordHash: null });
    const compareSpy = vi.spyOn(argon2, 'verify');

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(compareSpy).toHaveBeenCalledTimes(1);

    compareSpy.mockRestore();
  });

  // Bug: user exists via OAuth (no password) — verifying against null crashes
  it('rejects user with no password hash (OAuth user)', async () => {
    mockUserRepo.findByEmail.mockResolvedValue({ ...STORED_USER, passwordHash: null });

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });
  });
});

describe('refresh', () => {
  it('rotates: returns a new pair, consumes the old record, and keeps the family', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockRefreshRepo.findByHash.mockResolvedValue(LIVE_RECORD);

    const result = await refresh('valid-refresh-token');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    expect(mockRefreshRepo.consume).toHaveBeenCalledWith('rt-1');
    // Bug this catches: starting a new family on rotation would break reuse
    // detection across the chain.
    expect(mockRefreshRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' }),
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
