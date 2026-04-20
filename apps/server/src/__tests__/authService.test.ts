import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  // bcrypt hash of "password123" (cost 12)
  passwordHash: '$2a$12$LJ3m4ys3Lf0v0cYGolA5oOZPJcxLyMnKfnGWlnKOCvQ4z5A9zFVHq',
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
    expect(insertCall.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
  });

  // Bug: if bcrypt or DB throws, service should degrade to INTERNAL_ERROR, not crash the request
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
});

describe('login', () => {
  it('returns tokens when password matches', async () => {
    // Use bcryptjs to create a real hash we can verify against
    const bcrypt = await import('bcryptjs');
    const realHash = await bcrypt.hash('correctpassword', 4); // low cost for speed
    mockUserRepo.findByEmail.mockResolvedValue({ ...STORED_USER, passwordHash: realHash });

    const result = await login('test@example.com', 'correctpassword');

    expect(result).toEqual({ ok: true, data: TOKEN_PAIR });
    expect(mockJwt.generateTokenPair).toHaveBeenCalledWith(STORED_USER.id);
  });

  it('rejects wrong password without leaking whether email exists', async () => {
    const bcrypt = await import('bcryptjs');
    const realHash = await bcrypt.hash('correctpassword', 4);
    mockUserRepo.findByEmail.mockResolvedValue({ ...STORED_USER, passwordHash: realHash });

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

  // Bug: user exists via OAuth (no password) — bcrypt.compare with null crashes
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
