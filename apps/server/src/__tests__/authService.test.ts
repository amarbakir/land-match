import { beforeEach, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

import * as userRepo from '../repos/userRepo';
import * as jwt from '../lib/jwt';
import { register, login, refresh } from '../services/authService';

vi.mock('../repos/userRepo');
vi.mock('../lib/jwt');

const mockUserRepo = vi.mocked(userRepo);
const mockJwt = vi.mocked(jwt);

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
  it('returns new token pair when refresh token is valid and user exists', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockUserRepo.findById.mockResolvedValue(STORED_USER);

    const result = await refresh('valid-refresh-token');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    expect(mockJwt.verifyToken).toHaveBeenCalledWith('valid-refresh-token', 'refresh');
  });

  it('rejects an invalid/expired refresh token', async () => {
    mockJwt.verifyToken.mockResolvedValue(null);

    const result = await refresh('expired-token');

    expect(result).toEqual({ ok: false, error: 'INVALID_REFRESH_TOKEN' });
    expect(mockUserRepo.findById).not.toHaveBeenCalled();
  });

  // Bug: if DB throws during refresh, should not crash
  it('returns INTERNAL_ERROR when findById throws', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'user-1' });
    mockUserRepo.findById.mockRejectedValue(new Error('DB timeout'));

    const result = await refresh('valid-token');

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
  });

  // Bug: user deleted between token issuance and refresh — stale token shouldn't work
  it('rejects refresh for a deleted user', async () => {
    mockJwt.verifyToken.mockResolvedValue({ sub: 'deleted-user' });
    mockUserRepo.findById.mockResolvedValue(undefined);

    const result = await refresh('valid-but-orphaned-token');

    expect(result).toEqual({ ok: false, error: 'USER_NOT_FOUND' });
    expect(mockJwt.generateTokenPair).not.toHaveBeenCalled();
  });
});
