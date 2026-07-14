import { err, ok, getAlertChannels, type Result } from '@landmatch/api';
import { generateSummary, mapEnrichmentRow, mapListingRow, scoreListing } from '@landmatch/scoring';
import type { SearchCriteria, SummaryInput } from '@landmatch/scoring';

import { captureError, runBestEffort } from '../lib/captureError';
import { llmClient } from '../lib/llm';
import { consumeSummaryBudget, refundSummaryBudget } from '../lib/summaryBudget';
import { features } from '../config';
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
      // Owned listings match only their owner's profiles; ownerless (feed)
      // listings match everyone — matching-side dual of listingRepo.visibleTo.
      searchProfileRepo.findActive(data.listing.userId),
      scoreRepo.findScoredProfileIds(listingId),
      alertRepo.findAlertedProfileIds(listingId),
    ]);

    const listingData = mapListingRow(data.listing);
    const enrichmentData = mapEnrichmentRow(data.enrichment);

    let scored = 0;
    let alertsCreated = 0;
    const pendingSummaries: { scoreId: string; userId: string; input: SummaryInput }[] = [];

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
        const values = { overallScore: result.overallScore, componentScores };
        let scoreRow = alreadyScored
          ? await scoreRepo.updateScoreValues(listingId, profile.id, values, tx)
          : await scoreRepo.insert({ listingId, searchProfileId: profile.id, ...values }, tx);
        if (!scoreRow && !alreadyScored && opts.rescore) {
          // Rescore lost the insert race to a concurrent initial-match run —
          // this run's values come from fresher enrichment, so refresh the
          // winner's row rather than silently keeping its stale score.
          scoreRow = await scoreRepo.updateScoreValues(listingId, profile.id, values, tx);
        }
        // null: row deleted since the id set was read, or a concurrent run
        // won the insert race (unique index) — it owns the alerts too.
        if (!scoreRow) return null;

        let alerts = 0;
        // 'inbox' guard: a rescored row keeps its user-facing status, so a
        // dismissed/shortlisted match crossing the threshold must not fire a
        // fresh alert pointing at something the inbox no longer shows.
        if (result.overallScore >= profile.alertThreshold && !alertedProfileIds.has(profile.id) && scoreRow.status === 'inbox') {
          // TODO: cache by userId to avoid duplicate lookups when multiple profiles share a user
          // tx matters: reading on a second pool connection while this
          // transaction pins one deadlocks a small (Lambda) pool.
          const user = await userRepo.findById(profile.userId, tx);
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
        return { alerts, scoreRow };
      });

      if (!written) continue;
      scored++;
      alertsCreated += written.alerts;

      // Queue, don't generate here: an alert-worthy match the user will see
      // gets an LLM verdict, but on Lambda the caller's matching promise is
      // fire-and-forget, so generating inline would make a slow LLM call for
      // this profile delay (or, on a frozen instance, lose) the next
      // profile's score/alert transaction. Collecting and generating after
      // all transactions commit keeps every profile's score safe regardless
      // of how long summary generation takes.
      if (
        features.enableLlmSummary &&
        !result.hardFilterFailed &&
        result.overallScore >= profile.alertThreshold &&
        written.scoreRow.status === 'inbox'
      ) {
        pendingSummaries.push({
          scoreId: written.scoreRow.id,
          userId: profile.userId,
          input: {
            scoringResult: result,
            enrichmentData,
            criteria,
            listingTitle: data.listing.title ?? data.listing.address ?? 'Untitled listing',
            listingUrl: data.listing.url ?? undefined,
          },
        });
      }
    }

    // Best-effort, post-loop: never fatal — a hung or failed LLM call must
    // not lose the score or the alert, and by this point every profile's
    // score/alert transaction has already committed.
    for (const pending of pendingSummaries) {
      await generateSummaryBestEffort(pending.scoreId, pending.userId, pending.input);
    }

    return ok({ scored, alertsCreated });
  } catch (error) {
    captureError(error, 'matchingService.matchListingAgainstProfiles');
    return err('INTERNAL_ERROR');
  }
}

function generateSummaryBestEffort(scoreId: string, userId: string, input: SummaryInput): Promise<void> {
  return runBestEffort('matchingService.generateSummaryBestEffort', async () => {
    const budget = await consumeSummaryBudget(userId);
    if (!budget.allowed) return;
    let summary: string;
    try {
      summary = await generateSummary(input, llmClient);
    } catch (error) {
      // Nothing was generated, so nothing was spent — refund the unit into
      // the window it came from. A successful generation whose DB write
      // fails below is NOT refunded: the LLM cost is real either way.
      await refundSummaryBudget(userId, budget.resetAt);
      throw error;
    }
    if (summary) await scoreRepo.updateLlmSummary(scoreId, summary);
  });
}
