import { describe, expect, it } from 'vitest';

import { llm } from '../config';
import { consumeSummaryBudget, refundSummaryBudget } from '../lib/summaryBudget';

// Exercises the real in-memory store (RATE_LIMIT_STORE defaults to 'memory'
// in tests) — each test uses its own userId so windows don't interact.
describe('summary budget', () => {
  it('denies consumption once the daily limit is spent', async () => {
    const userId = 'budget-exhaust-user';

    for (let i = 0; i < llm.dailyLimit; i++) {
      expect(await consumeSummaryBudget(userId)).toBe(true);
    }

    expect(await consumeSummaryBudget(userId)).toBe(false);
  });

  it('a refunded unit can be consumed again — but only once', async () => {
    // Bug this catches: consuming budget for a generation that threw (an
    // Anthropic outage day burns the whole daily budget producing nothing).
    const userId = 'budget-refund-user';
    for (let i = 0; i < llm.dailyLimit; i++) {
      await consumeSummaryBudget(userId);
    }

    await refundSummaryBudget(userId);

    expect(await consumeSummaryBudget(userId)).toBe(true); // the refunded unit
    expect(await consumeSummaryBudget(userId)).toBe(false); // budget truly gone
  });

  it('refund before any consume does not mint extra budget', async () => {
    // Bug this catches: a decrement that goes negative would grant limit+1
    // generations to a user whose first generation of the day failed early.
    const userId = 'budget-floor-user';

    await refundSummaryBudget(userId);

    for (let i = 0; i < llm.dailyLimit; i++) {
      expect(await consumeSummaryBudget(userId)).toBe(true);
    }
    expect(await consumeSummaryBudget(userId)).toBe(false);
  });
});
