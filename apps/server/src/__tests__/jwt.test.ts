import { describe, expect, it } from 'vitest';

import { signToken, verifyToken, generateTokenPair } from '../lib/jwt';

describe('jwt', () => {
  const userId = 'user-123';

  describe('signToken / verifyToken round-trip', () => {
    it('verifies an access token it signed', async () => {
      const token = await signToken(userId, 'access');
      const result = await verifyToken(token, 'access');
      expect(result).toEqual({ sub: userId });
    });

    it('verifies a refresh token it signed', async () => {
      const token = await signToken(userId, 'refresh');
      const result = await verifyToken(token, 'refresh');
      expect(result).toEqual({ sub: userId });
    });
  });

  describe('type mismatch rejection', () => {
    // Bug: if type claim isn't checked, a leaked refresh token could be used as access
    it('rejects an access token when refresh is expected', async () => {
      const token = await signToken(userId, 'access');
      const result = await verifyToken(token, 'refresh');
      expect(result).toBeNull();
    });

    it('rejects a refresh token when access is expected', async () => {
      const token = await signToken(userId, 'refresh');
      const result = await verifyToken(token, 'access');
      expect(result).toBeNull();
    });
  });

  describe('malformed input', () => {
    it('returns null for garbage strings', async () => {
      const result = await verifyToken('not-a-jwt', 'access');
      expect(result).toBeNull();
    });

    it('returns null for empty string', async () => {
      const result = await verifyToken('', 'access');
      expect(result).toBeNull();
    });
  });

  describe('generateTokenPair', () => {
    it('returns both tokens and expiresIn in seconds', async () => {
      const pair = await generateTokenPair(userId);
      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.expiresIn).toBe(900); // 15m default

      // Access and refresh tokens should be different
      expect(pair.accessToken).not.toBe(pair.refreshToken);
    });

    it('produces tokens that verify with correct types', async () => {
      const pair = await generateTokenPair(userId);
      const access = await verifyToken(pair.accessToken, 'access');
      const refresh = await verifyToken(pair.refreshToken, 'refresh');
      expect(access).toEqual({ sub: userId });
      expect(refresh).toEqual({ sub: userId });
    });
  });
});
