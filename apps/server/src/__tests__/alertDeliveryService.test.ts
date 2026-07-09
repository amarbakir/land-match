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
  enrichmentAttempts: 0,
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  delistedAt: null,
  userId: null,
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
  // Most tests exercise a single claimed alert; individual tests override.
  mockAlertRepo.claimPending.mockResolvedValue(['alert-1']);
});

describe('deliverPendingAlerts', () => {
  it('sends digest for eligible daily alerts when window has elapsed', async () => {
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([makePendingAlert()]);
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

  it('skips daily digest when window has not elapsed and releases the claim', async () => {
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([makePendingAlert()]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(new Date(Date.now() - 1 * 60 * 60 * 1000)); // 1h ago

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(0);
    expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockAlertRepo.markSent).not.toHaveBeenCalled();
    // Bug this catches: leaving skipped alerts in 'processing' — they'd be
    // invisible to the next run until the stale-claim timeout, delaying the
    // digest by up to 15 minutes per cycle.
    expect(mockAlertRepo.releaseClaims).toHaveBeenCalledWith(['alert-1']);
  });

  it('sends instant alerts immediately regardless of lastSentAt', async () => {
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([
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

  it('replaces a stored non-web listing URL with # in the email payload', async () => {
    // Bug this catches: a javascript: URL that predates schema validation (or
    // slips past it) must never reach the email template as a clickable href —
    // clicking it in a webmail client that honors the scheme executes script.
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([
      makePendingAlert({ alertFrequency: 'instant' }),
    ]);
    mockAlertRepo.findLastSentAt.mockResolvedValueOnce(null);
    mockListingRepo.findByIds.mockResolvedValueOnce([
      { ...LISTING, url: 'javascript:alert(document.cookie)' },
    ]);
    mockScoreRepo.findByIds.mockResolvedValueOnce([SCORE]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    expect(mockRender.renderAlertEmail).toHaveBeenCalledOnce();
    const { alerts } = mockRender.renderAlertEmail.mock.calls[0][0];
    expect(alerts[0].listingUrl).toBe('#');
  });

  it('marks alerts as failed and captures error on Resend failure', async () => {
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([
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
    mockAlertRepo.claimPending.mockResolvedValue(['alert-1', 'alert-2']);
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([
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

  it('releases everything unprocessed when the deadline has passed', async () => {
    // Bug this catches: no deadline handling — a Lambda hard-kill mid-send
    // leaves alerts frozen in 'processing' and risks a duplicate email after
    // the stale-claim window.
    mockAlertRepo.findClaimedWithDetails.mockResolvedValueOnce([
      makePendingAlert({ alertFrequency: 'instant' }),
    ]);

    const result = await deliverPendingAlerts({ deadlineAt: Date.now() - 1 });

    expect(result.ok).toBe(true);
    expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    expect(mockAlertRepo.releaseClaims).toHaveBeenCalledWith(['alert-1']);
  });

  it('returns success with zero counts when nothing is claimable', async () => {
    mockAlertRepo.claimPending.mockResolvedValue([]);

    const result = await deliverPendingAlerts();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailsSent).toBe(0);
    expect(result.data.alertsProcessed).toBe(0);
    expect(result.data.errors).toHaveLength(0);
    expect(mockAlertRepo.findClaimedWithDetails).not.toHaveBeenCalled();
  });
});
