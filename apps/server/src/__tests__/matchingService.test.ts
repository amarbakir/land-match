import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';
import * as scoring from '@landmatch/scoring';
import { matchListingAgainstProfiles } from '../services/matchingService';

vi.mock('../repos/listingRepo');
vi.mock('../repos/searchProfileRepo');
vi.mock('../repos/scoreRepo');
vi.mock('../repos/alertRepo');
vi.mock('@landmatch/scoring');

const mockListingRepo = vi.mocked(listingRepo);
const mockProfileRepo = vi.mocked(searchProfileRepo);
const mockScoreRepo = vi.mocked(scoreRepo);
const mockAlertRepo = vi.mocked(alertRepo);
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
  enrichmentStatus: 'complete',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  delistedAt: null,
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
  enrichedAt: new Date(),
  sourcesUsed: ['usda', 'fema'],
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
      scoredAt: new Date(),
    });
    mockAlertRepo.insert.mockResolvedValueOnce({} as any);

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(1);
    expect(result.data.alertsCreated).toBe(1);
    expect(mockScoreRepo.insert).toHaveBeenCalledOnce();
    expect(mockAlertRepo.insert).toHaveBeenCalledOnce();
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

  it('returns error when listing not found', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce(null);

    const result = await matchListingAgainstProfiles('nonexistent');

    expect(result.ok).toBe(false);
  });
});
