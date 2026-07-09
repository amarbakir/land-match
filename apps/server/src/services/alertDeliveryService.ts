import { err, isHttpUrl, ok, type Result } from '@landmatch/api';

import { captureError } from '../lib/captureError';
import * as alertRepo from '../repos/alertRepo';
import * as listingRepo from '../repos/listingRepo';
import * as scoreRepo from '../repos/scoreRepo';
import { sendEmail } from '../lib/email';
import { renderAlertEmail, type AlertItem } from '../emails/renderAlert';

export interface DeliveryResult {
  emailsSent: number;
  alertsProcessed: number;
  errors: string[];
}

type AlertFrequency = 'instant' | 'daily' | 'weekly';

type PendingAlert = Awaited<ReturnType<typeof alertRepo.findClaimedWithDetails>>[number];

interface AlertGroup {
  userId: string;
  userEmail: string;
  userName: string | null;
  profileName: string;
  searchProfileId: string;
  alertFrequency: AlertFrequency;
  alerts: PendingAlert[];
}

function isWindowElapsed(frequency: AlertFrequency, lastSentAt: Date | null): boolean {
  if (frequency === 'instant') return true;
  if (!lastSentAt) return true;

  const now = Date.now();
  const elapsed = now - lastSentAt.getTime();
  const hours = elapsed / (1000 * 60 * 60);

  if (frequency === 'daily') return hours >= 24;
  if (frequency === 'weekly') return hours >= 168;

  return true;
}

function buildSubject(alerts: AlertItem[], profileName: string, frequency: AlertFrequency): string {
  if (frequency === 'instant' && alerts.length === 1) {
    return `New match: ${alerts[0].listingTitle} — ${alerts[0].overallScore} score`;
  }
  return `${alerts.length} new match${alerts.length === 1 ? '' : 'es'} for ${profileName}`;
}

function buildMapUrl(lat: number | null, lng: number | null): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return 'https://www.google.com/maps';
}

function buildLocation(listing: { city: string | null; state: string | null; address: string | null }): string {
  if (listing.city && listing.state) return `${listing.city}, ${listing.state}`;
  if (listing.state) return listing.state;
  if (listing.address) return listing.address;
  return 'Location unknown';
}

export async function deliverPendingAlerts(): Promise<Result<DeliveryResult>> {
  try {
    // Claim first: concurrent delivery runs (scaled tasks, overlapping cron
    // invocations) partition the pending set instead of double-sending.
    const claimedIds = await alertRepo.claimPending();

    if (claimedIds.length === 0) {
      return ok({ emailsSent: 0, alertsProcessed: 0, errors: [] });
    }

    const pendingAlerts = await alertRepo.findClaimedWithDetails(claimedIds);

    // Group by userId:searchProfileId
    const groups = new Map<string, AlertGroup>();
    for (const alert of pendingAlerts) {
      const key = `${alert.userId}:${alert.searchProfileId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          userId: alert.userId,
          userEmail: alert.userEmail,
          userName: alert.userName,
          profileName: alert.profileName,
          searchProfileId: alert.searchProfileId,
          alertFrequency: alert.alertFrequency as AlertFrequency,
          alerts: [],
        });
      }
      groups.get(key)!.alerts.push(alert);
    }

    let emailsSent = 0;
    let alertsProcessed = 0;
    const errors: string[] = [];
    const toRelease: string[] = [];

    // Process groups sequentially to respect Resend rate limits
    for (const group of groups.values()) {
      const alertIds = group.alerts.map((a) => a.alertId);

      try {
        // Check frequency window
        const lastSentAt = await alertRepo.findLastSentAt(group.userId, group.searchProfileId);
        if (!isWindowElapsed(group.alertFrequency, lastSentAt)) {
          toRelease.push(...alertIds); // back to pending; released in one batch below
          continue;
        }

        // Batch-load listings and scores
        const listingIds = [...new Set(group.alerts.map((a) => a.listingId))];
        const scoreIds = [...new Set(group.alerts.map((a) => a.scoreId))];

        const [listingsData, scoresData] = await Promise.all([
          listingRepo.findByIds(listingIds),
          scoreRepo.findByIds(scoreIds),
        ]);

        const listingMap = new Map(listingsData.map((l) => [l.id, l]));
        const scoreMap = new Map(scoresData.map((s) => [s.id, s]));

        // Build alert items
        const alertItems: AlertItem[] = group.alerts
          .map((alert) => {
            const listing = listingMap.get(alert.listingId);
            const score = scoreMap.get(alert.scoreId);
            if (!listing || !score) return null;

            return {
              listingTitle: listing.title ?? listing.address ?? 'Untitled Property',
              // Never let a stored non-web URL (javascript:, data:) become an
              // email link — schema validation guards new writes, this guards
              // whatever is already in the DB.
              listingUrl: isHttpUrl(listing.url) ? listing.url : '#',
              price: listing.price,
              acreage: listing.acreage,
              location: buildLocation(listing),
              overallScore: score.overallScore,
              componentScores: (score.componentScores ?? {}) as Record<string, number>,
              mapUrl: buildMapUrl(listing.latitude, listing.longitude),
            };
          })
          .filter((item): item is AlertItem => item !== null);

        if (alertItems.length === 0) {
          await alertRepo.markFailed(alertIds);
          errors.push(`No hydrated data for group ${group.userId}:${group.searchProfileId}`);
          continue;
        }

        const html = await renderAlertEmail({
          userName: group.userName,
          profileName: group.profileName,
          alerts: alertItems,
          frequency: group.alertFrequency,
        });

        const subject = buildSubject(alertItems, group.profileName, group.alertFrequency);

        await sendEmail({
          to: group.userEmail,
          subject,
          html,
        });

        await alertRepo.markSent(alertIds);
        emailsSent++;
        alertsProcessed += alertIds.length;
      } catch (error) {
        await alertRepo.markFailed(alertIds);
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to deliver to ${group.userEmail}: ${message}`);
      }
    }

    await alertRepo.releaseClaims(toRelease);

    return ok({ emailsSent, alertsProcessed, errors });
  } catch (error) {
    captureError(error, 'alertDeliveryService.deliverPendingAlerts');
    return err('INTERNAL_ERROR');
  }
}
