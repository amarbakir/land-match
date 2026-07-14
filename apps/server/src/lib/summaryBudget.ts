import { llm as llmConfig } from '../config';

import { captureError } from './captureError';
import { getSharedRateLimitStore } from './sharedRateLimitStore';

const DAY_MS = 24 * 60 * 60_000;

/** Consume one unit of the user's daily LLM-summary budget.
 *  Returns false when the day's budget is already spent. */
export async function consumeSummaryBudget(userId: string): Promise<boolean> {
  const window = await getSharedRateLimitStore().increment(`llm-summary:${userId}`, DAY_MS);
  return window.count <= llmConfig.dailyLimit;
}

/** Return one consumed unit after a generation that produced nothing (LLM
 *  threw) — an Anthropic outage day must not burn the daily budget for zero
 *  summaries. Best-effort: a failed refund never surfaces to the caller. */
export async function refundSummaryBudget(userId: string): Promise<void> {
  try {
    await getSharedRateLimitStore().decrement?.(`llm-summary:${userId}`);
  } catch (e) {
    captureError(e, 'summaryBudget: refund failed');
  }
}
