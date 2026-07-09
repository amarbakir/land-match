import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';
import * as userRepo from '../repos/userRepo';
import * as scoring from '@landmatch/scoring';
import { matchListingAgainstProfiles } from '../services/matchingService';

vi.mock('../repos/listingRepo');
vi.mock('../repos/searchProfileRepo');
vi.mock('../repos/scoreRepo');
vi.mock('../repos/alertRepo');
vi.mock('../repos/userRepo');
vi.mock('@landmatch/scoring');

const mockListingRepo = vi.mocked(listingRepo);
const mockProfileRepo = vi.mocked(searchProfileRepo);
const mockScoreRepo = vi.mocked(scoreRepo);
const mockAlertRepo = vi.mocked(alertRepo);
const mockUserRepo = vi.mocked(userRepo);
const mockScoring = vi.mocked(scoring);

const LISTING = {
  id: 'listing-1',
  externalId: 'ext-1',
  source: 'landwatch',
  url: 'https://example.com',
  title: '10 Acres',
  description: null,
  price: 200000,
  acreage: 10,
  address: '123 Main St',
  city: 'Hudson',
  county: 'Columbia',
  state: 'NY',
  zip: null,
  latitude: 42.25,
  longitude: -73.79,
  rawData: null,
  enrichmentStatus: 'enriched',
  enrichmentAttempts: 0,
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  delistedAt: null,
  userId: null,
};

const ENRICHMENT = {
  id: 'enr-1',
  listingId: 'listing-1',
  soilCapabilityClass: 2,
  soilDrainageClass: 'well drained',
  soilTexture: 'loam',
  soilSuitabilityRatings: null,
  femaFloodZone: 'X',
  floodZoneDescription: 'Minimal flood hazard',
  zoningCode: null,
  zoningDescription: null,
  verifiedAcreage: null,
  parcelGeometry: null,
  fireRiskScore: null,
  floodRiskScore: null,
  heatRiskScore: null,
  droughtRiskScore: null,
  frostFreeDays: null,
  annualPrecipIn: null,
  avgMinTempF: null,
  avgMaxTempF: null,
  growingSeasonDays: null,
  elevationFt: null,
  slopePct: null,
  wetlandType: null,
  wetlandDescription: null,
  wetlandWithinBufferFt: null,
  homesteadScore: null,
  enrichedAt: new Date(),
  sourcesUsed: ['usda', 'fema'],
};

const USER = {
  id: 'user-1',
  email: 'test@example.com',
  name: null,
  phone: null,
  authProvider: 'email',
  passwordHash: 'hash',
  subscriptionTier: 'free',
  notificationPrefs: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROFILE = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Hudson Valley',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 50,
  criteria: {
    price: { max: 300000 },
    acreage: { min: 5, max: 50 },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('matchListingAgainstProfiles', () => {
  it('scores listing against active profiles and creates alerts above threshold', async () => {
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 75,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set());
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });
    mockUserRepo.findById.mockResolvedValueOnce(USER);
    mockAlertRepo.insert.mockResolvedValueOnce({} as any);

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(1);
    expect(result.data.alertsCreated).toBe(1);
    expect(mockAlertRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'email' }),
    );
  });

  it('skips alert creation when score is below threshold', async () => {
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 40,
      componentScores: { soil: 50, flood: 50, price: 20, acreage: 50, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    const highThresholdProfile = { ...PROFILE, alertThreshold: 95 };
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([highThresholdProfile]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set());
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 40,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alertsCreated).toBe(0);
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('skips scoring when score already exists for listing+profile', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(0);
    expect(mockScoreRepo.insert).not.toHaveBeenCalled();
  });

  it('uses channel from user notification prefs instead of hardcoded email', async () => {
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 75,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set());
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });
    mockUserRepo.findById.mockResolvedValueOnce({
      ...USER,
      notificationPrefs: { alertChannels: ['sms'] },
    });
    mockAlertRepo.insert.mockResolvedValueOnce({} as any);

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockAlertRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms' }),
    );
  });

  it('creates one alert per channel when user has multiple channels selected', async () => {
    // Bug this catches: if the fan-out loop is missing, users who selected
    // multiple channels (e.g. email + push) only get alerted on the first one
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 75,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set());
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });
    mockUserRepo.findById.mockResolvedValueOnce({
      ...USER,
      notificationPrefs: { alertChannels: ['email', 'push'] },
    });
    mockAlertRepo.insert.mockResolvedValue({} as any);

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alertsCreated).toBe(2);
    expect(mockAlertRepo.insert).toHaveBeenCalledTimes(2);
    expect(mockAlertRepo.insert).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ channel: 'email' }),
    );
    expect(mockAlertRepo.insert).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ channel: 'push' }),
    );
  });

  // Bug these catch: re-enriched listings were scored once with neutral data
  // and matchListingAgainstProfiles skipped them forever, so the whole point
  // of re-enrichment (fixing stale neutral scores) was lost.
  it('rescore updates the existing score row instead of skipping it', async () => {
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 80,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.updateScoreValues.mockResolvedValueOnce({
      id: 'score-existing',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 80,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });
    mockUserRepo.findById.mockResolvedValueOnce(USER);
    mockAlertRepo.insert.mockResolvedValueOnce({} as any);

    const result = await matchListingAgainstProfiles('listing-1', { rescore: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(1);
    // Updates in place — never inserts a duplicate score row for the profile
    expect(mockScoreRepo.insert).not.toHaveBeenCalled();
    expect(mockScoreRepo.updateScoreValues).toHaveBeenCalledWith(
      'listing-1',
      'profile-1',
      expect.objectContaining({ overallScore: 80 }),
    );
    // Newly above threshold and never alerted → alert fires now
    expect(mockAlertRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('rescore does not re-alert profiles that were already alerted', async () => {
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 90,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockScoreRepo.updateScoreValues.mockResolvedValueOnce({
      id: 'score-existing',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 90,
      componentScores: {},
      llmSummary: null,
      status: 'inbox',
      readAt: null,
      scoredAt: new Date(),
    });

    const result = await matchListingAgainstProfiles('listing-1', { rescore: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alertsCreated).toBe(0);
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('rescore does not alert on a match the user already dismissed', async () => {
    // Phantom-alert bug: user dismissed the match at score 55; re-enrichment
    // raises it to 75. An alert email would point at a match their inbox no
    // longer shows.
    mockScoring.scoreListing.mockReturnValueOnce({
      overallScore: 75,
      componentScores: { soil: 85, flood: 100, price: 80, acreage: 100, zoning: 50, geography: 50, infrastructure: 50, climate: 50 },
      hardFilterFailed: false,
      failedFilters: [],
    });

    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());
    mockScoreRepo.updateScoreValues.mockResolvedValueOnce({
      id: 'score-existing',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      status: 'dismissed',
      readAt: new Date(),
      scoredAt: new Date(),
    });

    const result = await matchListingAgainstProfiles('listing-1', { rescore: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(1); // score still refreshed
    expect(result.data.alertsCreated).toBe(0);
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('without rescore, already-scored profiles are still skipped', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findScoredProfileIds.mockResolvedValueOnce(new Set(['profile-1']));
    mockAlertRepo.findAlertedProfileIds.mockResolvedValueOnce(new Set());

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(0);
    expect(mockScoreRepo.updateScoreValues).not.toHaveBeenCalled();
  });

  it('returns error when listing not found', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce(null);

    const result = await matchListingAgainstProfiles('nonexistent');

    expect(result.ok).toBe(false);
  });

  it('returns error when listing exists but has no enrichment', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: null,
    });

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Listing not enriched');
    expect(mockScoreRepo.insert).not.toHaveBeenCalled();
  });
});
