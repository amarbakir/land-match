import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as userRepo from '../repos/userRepo';
import * as userService from '../services/userService';

vi.mock('../repos/userRepo');

const mockRepo = vi.mocked(userRepo);

const USER_ROW = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: null,
  authProvider: 'email',
  passwordHash: 'hashed',
  subscriptionTier: 'free',
  notificationPrefs: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

beforeEach(() => vi.resetAllMocks());

describe('userService', () => {
  describe('getNotificationPrefs', () => {
    it('returns default [email] when user has no prefs set (null column)', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...USER_ROW, notificationPrefs: null });

      const result = await userService.getNotificationPrefs('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alertChannels).toEqual(['email']);
      }
    });

    it('returns stored prefs when user has valid preferences', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        ...USER_ROW,
        notificationPrefs: { alertChannels: ['sms'] },
      });

      const result = await userService.getNotificationPrefs('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alertChannels).toEqual(['sms']);
      }
    });

    it('returns NOT_FOUND when user does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(undefined);

      const result = await userService.getNotificationPrefs('nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
    });

    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockRepo.findById.mockRejectedValueOnce(new Error('connection refused'));

      const result = await userService.getNotificationPrefs('user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('updateNotificationPrefs', () => {
    it('updates and returns the new prefs', async () => {
      mockRepo.updateNotificationPrefs.mockResolvedValueOnce({
        ...USER_ROW,
        notificationPrefs: { alertChannels: ['push'] },
        updatedAt: new Date('2026-02-01'),
      });

      const result = await userService.updateNotificationPrefs('user-1', { alertChannels: ['push'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alertChannels).toEqual(['push']);
      }
    });

    it('passes the input to the repo for persistence', async () => {
      mockRepo.updateNotificationPrefs.mockResolvedValueOnce({
        ...USER_ROW,
        notificationPrefs: { alertChannels: ['sms'] },
      });

      await userService.updateNotificationPrefs('user-1', { alertChannels: ['sms'] });

      expect(mockRepo.updateNotificationPrefs).toHaveBeenCalledWith(
        'user-1',
        { alertChannels: ['sms'] },
      );
    });

    it('returns NOT_FOUND when user does not exist', async () => {
      mockRepo.updateNotificationPrefs.mockResolvedValueOnce(null as never);

      const result = await userService.updateNotificationPrefs('nonexistent', { alertChannels: ['email'] });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
    });

    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockRepo.updateNotificationPrefs.mockRejectedValueOnce(new Error('connection refused'));

      const result = await userService.updateNotificationPrefs('user-1', { alertChannels: ['email'] });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });
});
