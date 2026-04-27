import { err, ok, getAlertChannels, type Result } from '@landmatch/api';
import { mapEnrichmentRow, mapListingRow, scoreListing } from '@landmatch/scoring';
import type { SearchCriteria } from '@landmatch/scoring';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';
import * as userRepo from '../repos/userRepo';

interface MatchResult {
  scored: number;
  alertsCreated: number;
}

export async function matchListingAgainstProfiles(listingId: string): Promise<Result<MatchResult>> {
  try {
    const data = await listingRepo.findListingWithEnrichment(listingId);
    if (!data) return err('Listing not found');
    if (!data.enrichment) return err('Listing not enriched');

    const [profiles, scoredProfileIds, alertedProfileIds] = await Promise.all([
      searchProfileRepo.findActive(),
      scoreRepo.findScoredProfileIds(listingId),
      alertRepo.findAlertedProfileIds(listingId),
    ]);

    const listingData = mapListingRow(data.listing);
    const enrichmentData = mapEnrichmentRow(data.enrichment);

    let scored = 0;
    let alertsCreated = 0;

    // TODO: iterations are independent — could parallelize with Promise.all if profile count grows
    for (const profile of profiles) {
      if (scoredProfileIds.has(profile.id)) continue;

      const criteria = profile.criteria as SearchCriteria;
      const result = scoreListing(listingData, enrichmentData, criteria);

      const scoreRow = await scoreRepo.insert({
        listingId,
        searchProfileId: profile.id,
        overallScore: result.overallScore,
        componentScores: result.componentScores as unknown as Record<string, number>,
      });
      scored++;

      if (result.overallScore >= profile.alertThreshold && !alertedProfileIds.has(profile.id)) {
        // TODO: cache by userId to avoid duplicate lookups when multiple profiles share a user
        const user = await userRepo.findById(profile.userId);
        const channels = getAlertChannels(user?.notificationPrefs);

        for (const channel of channels) {
          await alertRepo.insert({
            userId: profile.userId,
            searchProfileId: profile.id,
            listingId,
            scoreId: scoreRow.id,
            channel,
          });
          alertsCreated++;
        }
      }
    }

    return ok({ scored, alertsCreated });
  } catch (error) {
    console.error('[matchingService.matchListingAgainstProfiles]', error);
    return err('INTERNAL_ERROR');
  }
}
