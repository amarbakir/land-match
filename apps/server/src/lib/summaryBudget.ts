import { llm as llmConfig, server } from '../config';

import { captureError } from './captureError';
import { InMemoryRateLimitStore, type RateLimitStore } from './rateLimitStore';
import { PostgresRateLimitStore } from './postgresRateLimitStore';

const DAY_MS = 24 * 60 * 60_000;

let store: RateLimitStore | undefined;

// Same store selection as app.ts middleware: the Lambda stages need the
// Postgres store or each container gets its own daily budget.
function getStore(): RateLimitStore {
  store ??= server.rateLimitStore === 'postgres'
    ? new PostgresRateLimitStore()
    : new InMemoryRateLimitStore();
  return store;
}

/** Consume one unit of the user's daily LLM-summary budget.
 *  Returns false when the day's budget is already spent. */
export async function consumeSummaryBudget(userId: string): Promise<boolean> {
  const window = await getStore().increment(`llm-summary:${userId}`, DAY_MS);
  return window.count <= llmConfig.dailyLimit;
}

/** Return one consumed unit after a generation that produced nothing (LLM
 *  threw) — an Anthropic outage day must not burn the daily budget for zero
 *  summaries. Best-effort: a failed refund never surfaces to the caller. */
export async function refundSummaryBudget(userId: string): Promise<void> {
  try {
    await getStore().decrement?.(`llm-summary:${userId}`);
  } catch (e) {
    captureError(e, 'summaryBudget: refund failed');
  }
}
