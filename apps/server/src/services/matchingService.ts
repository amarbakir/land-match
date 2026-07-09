import { err, ok, getAlertChannels, type Result } from '@landmatch/api';
import { mapEnrichmentRow, mapListingRow, scoreListing } from '@landmatch/scoring';
import type { SearchCriteria } from '@landmatch/scoring';

import { captureError } from '../lib/captureError';
import { db } from '../db/client';
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

      // Score + alerts commit atomically per profile: a crash between them
      // must not leave a scored row whose alert is lost forever (the score's
      // existence is what suppresses future alert attempts).
      const written = await db.transaction(async (tx) => {
        const scoreRow = alreadyScored
          ? await scoreRepo.updateScoreValues(listingId, profile.id, {
              overallScore: result.overallScore,
              componentScores,
            }, tx)
          : await scoreRepo.insert({
              listingId,
              searchProfileId: profile.id,
              overallScore: result.overallScore,
              componentScores,
            }, tx);
        // null: row deleted since the id set was read, or a concurrent run
        // won the insert race (unique index) — it owns the alerts too.
        if (!scoreRow) return null;

        let alerts = 0;
        // 'inbox' guard: a rescored row keeps its user-facing status, so a
        // dismissed/shortlisted match crossing the threshold must not fire a
        // fresh alert pointing at something the inbox no longer shows.
        if (result.overallScore >= profile.alertThreshold && !alertedProfileIds.has(profile.id) && scoreRow.status === 'inbox') {
          // TODO: cache by userId to avoid duplicate lookups when multiple profiles share a user
          const user = await userRepo.findById(profile.userId);
          const channels = getAlertChannels(user?.notificationPrefs);

          for (const channel of channels) {
            const alertRow = await alertRepo.insert({
              userId: profile.userId,
              searchProfileId: profile.id,
              listingId,
              scoreId: scoreRow.id,
              channel,
            }, tx);
            if (alertRow) alerts++;
          }
        }
        return { alerts };
      });

      if (!written) continue;
      scored++;
      alertsCreated += written.alerts;
    }

    return ok({ scored, alertsCreated });
  } catch (error) {
    captureError(error, 'matchingService.matchListingAgainstProfiles');
    return err('INTERNAL_ERROR');
  }
}
