import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as scoreRepo from '../repos/scoreRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as matchService from '../services/matchService';

vi.mock('../repos/scoreRepo');
vi.mock('../repos/searchProfileRepo');

const mockScoreRepo = vi.mocked(scoreRepo);
const mockProfileRepo = vi.mocked(searchProfileRepo);

const PROFILE_ROW = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'NC Homestead',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 60,
  criteria: { price: { max: 400000 } },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SCORE_ROW = {
  id: 'score-1',
  listingId: 'listing-1',
  searchProfileId: 'profile-1',
  overallScore: 87,
  componentScores: { soil: 92, flood: 95, price: 80, acreage: 85, zoning: 88, geography: 90, infrastructure: 70, climate: 74 },
  llmSummary: 'Good match for homesteading',
  status: 'inbox',
  readAt: null,
  scoredAt: new Date('2026-04-19T12:00:00Z'),
};

const MATCH_ROW = {
  scoreId: 'score-1',
  listingId: 'listing-1',
  overallScore: 87,
  componentScores: { soil: 92, flood: 95, price: 80, acreage: 85, zoning: 88, geography: 90, infrastructure: 70, climate: 74 },
  llmSummary: 'Good match for homesteading',
  status: 'inbox',
  readAt: null,
  scoredAt: new Date('2026-04-19T12:00:00Z'),
  title: '40 Acres — Madison County',
  address: '123 County Rd, Madison, NC',
  price: 185000,
  acreage: 40,
  source: 'LandWatch',
  url: 'https://landwatch.com/123',
  lat: 35.59,
  lng: -82.55,
  soilClass: 2,
  floodZone: 'X',
  zoning: 'agricultural',
};

const DEFAULT_FILTERS = { sort: 'score' as const, sortDir: 'desc' as const, limit: 20, offset: 0 };

beforeEach(() => vi.resetAllMocks());

describe('matchService', () => {
  describe('getMatches', () => {
    it('returns matches when profile is owned by user', async () => {
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.findMatchesByProfile.mockResolvedValueOnce({ rows: [MATCH_ROW], total: 1 });

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.total).toBe(1);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0].scoreId).toBe('score-1');
      }
    });

    it('returns NOT_FOUND when profile does not exist', async () => {
      mockProfileRepo.findById.mockResolvedValueOnce(undefined);

      const result = await matchService.getMatches('user-1', 'nonexistent', DEFAULT_FILTERS);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
      expect(mockScoreRepo.findMatchesByProfile).not.toHaveBeenCalled();
    });

    it('returns FORBIDDEN when profile belongs to another user — prevents reading another user matches', async () => {
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW); // profile.userId = 'user-1'

      const result = await matchService.getMatches('attacker', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
      // Without this check any authenticated user can read any profile's matches
      expect(mockScoreRepo.findMatchesByProfile).not.toHaveBeenCalled();
    });

    it('correctly derives soilClassLabel from soilClass integer', async () => {
      const rows = [
        { ...MATCH_ROW, soilClass: 1 },
        { ...MATCH_ROW, scoreId: 'score-2', soilClass: 3 },
        { ...MATCH_ROW, scoreId: 'score-3', soilClass: 8 },
      ];
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.findMatchesByProfile.mockResolvedValueOnce({ rows, total: 3 });

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items[0].soilClassLabel).toBe('Class I');
        expect(result.data.items[1].soilClassLabel).toBe('Class III');
        expect(result.data.items[2].soilClassLabel).toBe('Class VIII');
      }
    });

    it('correctly derives primeFarmland: true when soilClass <= 2, false when > 2', async () => {
      const rows = [
        { ...MATCH_ROW, scoreId: 'score-1', soilClass: 1 },
        { ...MATCH_ROW, scoreId: 'score-2', soilClass: 2 },
        { ...MATCH_ROW, scoreId: 'score-3', soilClass: 3 },
        { ...MATCH_ROW, scoreId: 'score-4', soilClass: 7 },
      ];
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.findMatchesByProfile.mockResolvedValueOnce({ rows, total: 4 });

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items[0].primeFarmland).toBe(true);  // class I
        expect(result.data.items[1].primeFarmland).toBe(true);  // class II
        expect(result.data.items[2].primeFarmland).toBe(false); // class III
        expect(result.data.items[3].primeFarmland).toBe(false); // class VII
      }
    });

    it('returns null for primeFarmland and soilClassLabel when soilClass is null — avoids crash on unenriched listings', async () => {
      const unenrichedRow = {
        ...MATCH_ROW,
        soilClass: null,
        floodZone: null,
        zoning: null,
      };
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.findMatchesByProfile.mockResolvedValueOnce({ rows: [unenrichedRow], total: 1 });

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const item = result.data.items[0];
        expect(item.soilClass).toBeNull();
        expect(item.soilClassLabel).toBeNull();
        expect(item.primeFarmland).toBeNull();
        expect(item.floodZone).toBeNull();
        expect(item.zoning).toBeNull();
      }
    });

    it('converts Date fields to ISO strings', async () => {
      const rowWithReadAt = {
        ...MATCH_ROW,
        readAt: new Date('2026-04-19T15:00:00Z'),
        scoredAt: new Date('2026-04-19T12:00:00Z'),
      };
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.findMatchesByProfile.mockResolvedValueOnce({ rows: [rowWithReadAt], total: 1 });

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const item = result.data.items[0];
        expect(item.readAt).toBe('2026-04-19T15:00:00.000Z');
        expect(item.scoredAt).toBe('2026-04-19T12:00:00.000Z');
        // Confirms these are strings, not Date objects (which would break JSON serialization)
        expect(typeof item.readAt).toBe('string');
        expect(typeof item.scoredAt).toBe('string');
      }
    });

    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockProfileRepo.findById.mockRejectedValueOnce(new Error('connection refused'));

      const result = await matchService.getMatches('user-1', 'profile-1', DEFAULT_FILTERS);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('updateMatchStatus', () => {
    it('successfully updates status to shortlisted', async () => {
      const updatedScore = { ...SCORE_ROW, status: 'shortlisted', readAt: null };
      mockScoreRepo.findById.mockResolvedValueOnce(SCORE_ROW);
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.updateStatus.mockResolvedValueOnce(updatedScore);

      const result = await matchService.updateMatchStatus('user-1', 'score-1', { status: 'shortlisted' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.scoreId).toBe('score-1');
        expect(result.data.status).toBe('shortlisted');
      }
    });

    it('returns NOT_FOUND when score does not exist', async () => {
      mockScoreRepo.findById.mockResolvedValueOnce(undefined);

      const result = await matchService.updateMatchStatus('user-1', 'nonexistent', { status: 'shortlisted' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
      expect(mockScoreRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('returns FORBIDDEN when score belongs to another user — prevents IDOR vulnerability', async () => {
      // score-1 belongs to profile-1 which belongs to user-1
      // attacker tries to update it as their own score
      mockScoreRepo.findById.mockResolvedValueOnce(SCORE_ROW);
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW); // userId = 'user-1'

      const result = await matchService.updateMatchStatus('attacker', 'score-1', { status: 'shortlisted' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
      // Without ownership check, any user could modify any score
      expect(mockScoreRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('does NOT overwrite readAt when score is already read — preserves original read timestamp', async () => {
      const alreadyReadScore = { ...SCORE_ROW, readAt: new Date('2026-04-18T10:00:00Z') };
      const updatedScore = { ...alreadyReadScore, status: 'shortlisted' };
      mockScoreRepo.findById.mockResolvedValueOnce(alreadyReadScore);
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.updateStatus.mockResolvedValueOnce(updatedScore);

      await matchService.updateMatchStatus('user-1', 'score-1', { status: 'shortlisted', markAsRead: true });

      // readAt must NOT be included in the update payload — it was already set
      expect(mockScoreRepo.updateStatus).toHaveBeenCalledWith(
        'score-1',
        expect.not.objectContaining({ readAt: expect.anything() }),
      );
    });

    it('sets readAt when markAsRead=true and score has never been read', async () => {
      const unreadScore = { ...SCORE_ROW, readAt: null };
      const updatedScore = { ...unreadScore, readAt: new Date() };
      mockScoreRepo.findById.mockResolvedValueOnce(unreadScore);
      mockProfileRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockScoreRepo.updateStatus.mockResolvedValueOnce(updatedScore);

      await matchService.updateMatchStatus('user-1', 'score-1', { markAsRead: true });

      expect(mockScoreRepo.updateStatus).toHaveBeenCalledWith(
        'score-1',
        expect.objectContaining({ readAt: expect.any(Date) }),
      );
    });

    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockScoreRepo.findById.mockRejectedValueOnce(new Error('DB timeout'));

      const result = await matchService.updateMatchStatus('user-1', 'score-1', { status: 'shortlisted' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('getProfileCounts', () => {
    it('returns counts for profiles that have scores', async () => {
      const profiles = [PROFILE_ROW];
      const counts = [{ profileId: 'profile-1', total: 10, unread: 3, shortlisted: 2 }];
      mockProfileRepo.findByUserId.mockResolvedValueOnce(profiles);
      mockScoreRepo.getProfileCounts.mockResolvedValueOnce(counts);

      const result = await matchService.getProfileCounts('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual({ profileId: 'profile-1', total: 10, unread: 3, shortlisted: 2 });
      }
    });

    it('returns zero counts for profiles with no scores — ensures all profiles appear in response', async () => {
      const profileWithScores = { ...PROFILE_ROW, id: 'profile-1' };
      const profileWithoutScores = { ...PROFILE_ROW, id: 'profile-2', name: 'Empty Profile' };
      mockProfileRepo.findByUserId.mockResolvedValueOnce([profileWithScores, profileWithoutScores]);
      // scoreRepo only returns rows for profiles that have at least one score
      mockScoreRepo.getProfileCounts.mockResolvedValueOnce([
        { profileId: 'profile-1', total: 5, unread: 1, shortlisted: 0 },
        // profile-2 is absent — no scores exist for it
      ]);

      const result = await matchService.getProfileCounts('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        const emptyProfile = result.data.find(c => c.profileId === 'profile-2');
        expect(emptyProfile).toEqual({ profileId: 'profile-2', total: 0, unread: 0, shortlisted: 0 });
      }
    });

    it('returns empty array when user has no profiles', async () => {
      mockProfileRepo.findByUserId.mockResolvedValueOnce([]);
      mockScoreRepo.getProfileCounts.mockResolvedValueOnce([]);

      const result = await matchService.getProfileCounts('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual([]);
      }
    });

    it('returns INTERNAL_ERROR when repo throws', async () => {
      mockProfileRepo.findByUserId.mockRejectedValueOnce(new Error('connection lost'));

      const result = await matchService.getProfileCounts('user-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR');
    });
  });
});
