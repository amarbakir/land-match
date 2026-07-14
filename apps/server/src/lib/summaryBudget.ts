import { llm as llmConfig } from '../config';

import { runBestEffort } from './captureError';
import { getSharedRateLimitStore } from './sharedRateLimitStore';

const DAY_MS = 24 * 60 * 60_000;

export interface SummaryBudget {
  allowed: boolean;
  /** Identifies the window the unit was consumed in — pass to refund. */
  resetAt: number;
}

/** Consume one unit of the user's daily LLM-summary budget.
 *  `allowed: false` when the day's budget is already spent. */
export async function consumeSummaryBudget(userId: string): Promise<SummaryBudget> {
  const key = `llm-summary:${userId}`;
  const window = await getSharedRateLimitStore().increment(key, DAY_MS);
  const allowed = window.count <= llmConfig.dailyLimit;
  if (!allowed) {
    // The denied attempt still inflated the counter — undo it, or it absorbs
    // a concurrent consumer's refund and the user loses a spendable unit.
    await runBestEffort('summaryBudget: denied-consume rollback failed', () =>
      getSharedRateLimitStore().decrement(key, window.resetAt),
    );
  }
  return { allowed, resetAt: window.resetAt };
}

/** Return one consumed unit after a generation that produced nothing (LLM
 *  threw) — an Anthropic outage day must not burn the daily budget for zero
 *  summaries. Scoped to the consuming window via resetAt so a refund that
 *  straddles the daily rollover cannot mint budget in the new window.
 *  Best-effort: a failed refund never surfaces to the caller. */
export function refundSummaryBudget(userId: string, resetAt: number): Promise<void> {
  return runBestEffort('summaryBudget: refund failed', () =>
    getSharedRateLimitStore().decrement(`llm-summary:${userId}`, resetAt),
  );
}
