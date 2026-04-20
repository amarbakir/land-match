import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as alertRepo from '../repos/alertRepo';
import * as listingRepo from '../repos/listingRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as emailLib from '../lib/email';
import * as renderAlert from '../emails/renderAlert';
import { deliverPendingAlerts } from '../services/alertDeliveryService';

vi.mock('../repos/alertRepo');
vi.mock('../repos/listingRepo');
vi.mock('../repos/scoreRepo');
vi.mock('../lib/email');
vi.mock('../emails/renderAlert');

const mockAlertRepo = vi.mocked(alertRepo);
const mockListingRepo = vi.mocked(listingRepo);
const mockScoreRepo = vi.mocked(scoreRepo);
const mockEmail = vi.mocked(emailLib);
const mockRender = vi.mocked(renderAlert);

function makePendingAlert(overrides: Partial<ReturnType<typeof baseAlert>> = {}) {
  return { ...baseAlert(), ...overrides };
}

function baseAlert() {
  return {
    alertId: 'alert-1',
    listingId: 'listing-1',
    scoreId: 'score-1',
    userId: 'user-1',
    searchProfileId: 'profile-1',
    createdAt: new Date(),
    userEmail: 'user@example.com',
    userName: 'Test User',
    profileName: 'Hudson Valley',
    alertFrequency: 'daily',
  };
}

const LISTING = {
  id: 'listing-1',
  externalId: 'ext-1',
  source: 'landwatch',
  url: 'https://example.com/listing-1',
  title: '10 Acres in Hudson Valley',
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

const SCORE = {
  id: 'score-1',
  listingId: 'listing-1',
  searchProfileId: 'profile-1',
  overallScore: 75,
  componentScores: { soil: 85, flood: 100, price: 80 },
  llmSummary: null,
  status: 'inbox',
  readAt: null,
  scoredAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  mockRender.renderAlertEmail.mockResolvedValue('<html>test</html>');
  mockEmail.sendEmail.mockResolvedValue({ id: 'email-1' } as any);
});

describe('deliverPendingAlerts', () => {
  it('sends digest for eligible daily alerts when window has elapsed', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([makePendingAlert()]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(new Date(Date.now() - 25 * 60 * 60 * 1000)); // 25h ago
    mockListingRepo.findByIds.mockResolvedValueOnce([LISTING]);
    mockScoreRepo.findByIds.mockResolvedValueOnce([SCORE]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(1);
    expect(result.data.alertsProcessed).toBe(1);
    expect(mockEmail.sendEmail).toHaveBeenCalledOnce();
    expect(mockAlertRepo.markSent).toHaveBeenCalledWith(['alert-1']);
  });

  it('skips daily digest when window has not elapsed', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([makePendingAlert()]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(new Date(Date.now() - 1 * 60 * 60 * 1000)); // 1h ago

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(0);
    expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockAlertRepo.markSent).not.toHaveBeenCalled();
  });

  it('sends instant alerts immediately regardless of lastSentAt', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([
      makePendingAlert({ alertFrequency: 'instant' }),
    ]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(new Date()); // just sent
    mockListingRepo.findByIds.mockResolvedValueOnce([LISTING]);
    mockScoreRepo.findByIds.mockResolvedValueOnce([SCORE]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(1);
    expect(mockEmail.sendEmail).toHaveBeenCalledOnce();
  });

  it('marks alerts as failed and captures error on Resend failure', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([
      makePendingAlert({ alertFrequency: 'instant' }),
    ]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(null);
    mockListingRepo.findByIds.mockResolvedValueOnce([LISTING]);
    mockScoreRepo.findByIds.mockResolvedValueOnce([SCORE]);
    mockEmail.sendEmail.mockRejectedValueOnce(new Error('Resend rate limit'));

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(0);
    expect(result.data.errors).toHaveLength(1);
    expect(result.data.errors[0]).toContain('Resend rate limit');
    expect(mockAlertRepo.markFailed).toHaveBeenCalledWith(['alert-1']);
  });

  it('groups correctly — 2 profiles for same user produce 2 emails', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([
      makePendingAlert({ alertFrequency: 'instant' }),
      makePendingAlert({
        alertId: 'alert-2',
        searchProfileId: 'profile-2',
        listingId: 'listing-2',
        scoreId: 'score-2',
        profileName: 'Vermont Farm',
        alertFrequency: 'instant',
      }),
    ]);
    mockAlertRepo.findLastSentAt.mockResolvedValue(null);
    mockListingRepo.findByIds
      .mockResolvedValueOnce([LISTING])
      .mockResolvedValueOnce([{ ...LISTING, id: 'listing-2', title: 'Vermont Plot' }]);
    mockScoreRepo.findByIds
      .mockResolvedValueOnce([SCORE])
      .mockResolvedValueOnce([{ ...SCORE, id: 'score-2', searchProfileId: 'profile-2' }]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(2);
    expect(mockEmail.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('returns success with zero counts when no pending alerts', async () => {
    mockAlertRepo.findPendingWithDetails.mockResolvedValueOnce([]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(0);
    expect(result.data.alertsProcessed).toBe(0);
    expect(result.data.errors).toHaveLength(0);
  });
});
