import { err, ok, getAlertChannels, type Result } from '@landmatch/api';
import { mapEnrichmentRow, mapListingRow, scoreListing } from '@landmatch/scoring';
import type { SearchCriteria } from '@landmatch/scoring';

import { captureError } from '../lib/captureError';
import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';
import * as userRepo from '../repos/userRepo';

interface MatchResult {
  scored: number;
  alertsCreated: number;
}

// rescore: refresh existing score rows instead of skipping them — used after
// re-enrichment so listings first scored with neutral (missing) data don't
// keep their stale scores forever. Alert dedupe still applies.
export async function matchListingAgainstProfiles(
  listingId: string,
  opts: { rescore?: boolean } = {},
): Promise<Result<MatchResult>> {
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
      const alreadyScored = scoredProfileIds.has(profile.id);
      if (alreadyScored && !opts.rescore) continue;

      const criteria = profile.criteria as SearchCriteria;
      const result = scoreListing(listingData, enrichmentData, criteria);
      const componentScores = result.componentScores as unknown as Record<string, number>;

      const scoreRow = alreadyScored
        ? await scoreRepo.updateScoreValues(listingId, profile.id, {
            overallScore: result.overallScore,
            componentScores,
          })
        : await scoreRepo.insert({
            listingId,
            searchProfileId: profile.id,
            overallScore: result.overallScore,
            componentScores,
          });
      if (!scoreRow) continue; // score row deleted since the id set was read
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
    captureError(error, 'matchingService.matchListingAgainstProfiles');
    return err('INTERNAL_ERROR');
  }
}
