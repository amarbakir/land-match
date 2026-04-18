import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as searchProfileService from '../services/searchProfileService';

vi.mock('../repos/searchProfileRepo');

const mockRepo = vi.mocked(searchProfileRepo);

const PROFILE_ROW = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Hudson Valley Homestead',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 60,
  criteria: { price: { max: 400000 }, acreage: { min: 5 } },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

beforeEach(() => vi.resetAllMocks());

describe('searchProfileService', () => {
  describe('create', () => {
    it('inserts a profile and returns ok result', async () => {
      mockRepo.insert.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.create('user-1', {
        name: 'Hudson Valley Homestead',
        alertFrequency: 'daily',
        alertThreshold: 60,
        isActive: true,
        criteria: { price: { max: 400000 }, acreage: { min: 5 } },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe('profile-1');
        expect(result.data.name).toBe('Hudson Valley Homestead');
      }
      expect(mockRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', name: 'Hudson Valley Homestead' }),
      );
    });
  });

  describe('getById', () => {
    it('returns profile when owned by user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.getById('user-1', 'profile-1');

      expect(result.ok).toBe(true);
    });

    it('returns NOT_FOUND when profile does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(undefined);

      const result = await searchProfileService.getById('user-1', 'nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
    });

    it('returns FORBIDDEN when profile belongs to another user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.getById('other-user', 'profile-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
    });
  });

  describe('update', () => {
    it('updates and returns updated profile', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockRepo.update.mockResolvedValueOnce({ ...PROFILE_ROW, name: 'Updated' });

      const result = await searchProfileService.update('user-1', 'profile-1', { name: 'Updated' });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.name).toBe('Updated');
    });

    it('returns FORBIDDEN when updating another user profile', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.update('other-user', 'profile-1', { name: 'Hacked' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes profile owned by user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockRepo.deleteById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.remove('user-1', 'profile-1');

      expect(result.ok).toBe(true);
    });

    it('returns FORBIDDEN when deleting another user profile', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.remove('other-user', 'profile-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
      expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockRepo.insert.mockRejectedValueOnce(new Error('connection refused'));

      const result = await searchProfileService.create('user-1', {
        name: 'Test',
        alertFrequency: 'daily',
        alertThreshold: 60,
        isActive: true,
        criteria: {},
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });
});
