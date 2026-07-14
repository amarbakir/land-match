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

  // The unverified-flood opt-in is scoped to the exclusion selection it
  // modifies (land-match-dyh #3): stored criteria must never keep a latent
  // includeUnverifiedFloodZone without flood exclusions, or re-adding an
  // exclusion later silently re-admits unverified listings.
  describe('unverified-flood opt-in normalization', () => {
    it('strips the opt-in when created with no flood exclusions', async () => {
      mockRepo.insert.mockResolvedValueOnce(PROFILE_ROW);

      await searchProfileService.create('user-1', {
        name: 'No exclusions',
        alertFrequency: 'daily',
        alertThreshold: 60,
        isActive: true,
        criteria: { includeUnverifiedFloodZone: true, price: { max: 400000 } },
      });

      expect(mockRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          criteria: { price: { max: 400000 } },
        }),
      );
    });

    it('strips the opt-in when an update clears all flood exclusions', async () => {
      // The concrete stale-state path: opt in with exclusions, later clear
      // them — the switch disappears from the UI but true would persist.
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockRepo.update.mockResolvedValueOnce(PROFILE_ROW);

      await searchProfileService.update('user-1', 'profile-1', {
        criteria: { includeUnverifiedFloodZone: true, floodZoneExclude: [] },
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({ criteria: { floodZoneExclude: [] } }),
      );
    });

    it('preserves the opt-in while flood exclusions exist', async () => {
      mockRepo.insert.mockResolvedValueOnce(PROFILE_ROW);

      await searchProfileService.create('user-1', {
        name: 'With exclusions',
        alertFrequency: 'daily',
        alertThreshold: 60,
        isActive: true,
        criteria: { includeUnverifiedFloodZone: true, floodZoneExclude: ['A', 'AE'] },
      });

      expect(mockRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          criteria: { includeUnverifiedFloodZone: true, floodZoneExclude: ['A', 'AE'] },
        }),
      );
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
