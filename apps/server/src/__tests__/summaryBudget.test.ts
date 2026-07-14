import { afterEach, describe, expect, it, vi } from 'vitest';

import { llm } from '../config';
import { consumeSummaryBudget, refundSummaryBudget } from '../lib/summaryBudget';

afterEach(() => {
  vi.useRealTimers();
});

// Exercises the real in-memory store (RATE_LIMIT_STORE defaults to 'memory'
// in tests) — each test uses its own userId so windows don't interact.
describe('summary budget', () => {
  it('denies consumption once the daily limit is spent', async () => {
    const userId = 'budget-exhaust-user';

    for (let i = 0; i < llm.dailyLimit; i++) {
      expect((await consumeSummaryBudget(userId)).allowed).toBe(true);
    }

    expect((await consumeSummaryBudget(userId)).allowed).toBe(false);
  });

  it('a refunded unit can be consumed again — but only once', async () => {
    // Bug this catches: consuming budget for a generation that threw (an
    // Anthropic outage day burns the whole daily budget producing nothing).
    const userId = 'budget-refund-user';
    let last = { allowed: false, resetAt: 0 };
    for (let i = 0; i < llm.dailyLimit; i++) {
      last = await consumeSummaryBudget(userId);
    }

    await refundSummaryBudget(userId, last.resetAt);

    expect((await consumeSummaryBudget(userId)).allowed).toBe(true); // the refunded unit
    expect((await consumeSummaryBudget(userId)).allowed).toBe(false); // budget truly gone
  });

  it('refund before any consume does not mint extra budget', async () => {
    // Bug this catches: a decrement that goes negative would grant limit+1
    // generations to a user whose first generation of the day failed early.
    const userId = 'budget-floor-user';

    await refundSummaryBudget(userId, Date.now() + 60_000);

    for (let i = 0; i < llm.dailyLimit; i++) {
      expect((await consumeSummaryBudget(userId)).allowed).toBe(true);
    }
    expect((await consumeSummaryBudget(userId)).allowed).toBe(false);
  });

  it('a denied attempt does not absorb a later refund', async () => {
    // Bug this catches (561 review): denial still incremented the counter, so
    // a denied over-budget attempt landing between a consume and its refund
    // swallowed the refunded unit — the user got one fewer summary than the
    // cap on any day mixing an LLM failure with over-budget traffic.
    const userId = 'budget-denied-absorb-user';
    let last = { allowed: false, resetAt: 0 };
    for (let i = 0; i < llm.dailyLimit; i++) {
      last = await consumeSummaryBudget(userId);
    }

    expect((await consumeSummaryBudget(userId)).allowed).toBe(false); // denied attempt
    await refundSummaryBudget(userId, last.resetAt);

    expect((await consumeSummaryBudget(userId)).allowed).toBe(true); // refund still spendable
    expect((await consumeSummaryBudget(userId)).allowed).toBe(false);
  });

  it('a refund from an expired window does not mint budget in the new window', async () => {
    // Bug this catches (561 review): a generation straddling the daily-window
    // rollover would refund into the NEW day's window, granting limit+1 paid
    // generations — the cost cap the budget exists to enforce.
    vi.useFakeTimers();
    const userId = 'budget-rollover-user';

    const stale = await consumeSummaryBudget(userId);
    expect(stale.allowed).toBe(true);

    vi.advanceTimersByTime(25 * 60 * 60_000); // past the 24h window

    expect((await consumeSummaryBudget(userId)).allowed).toBe(true); // opens day N+1
    await refundSummaryBudget(userId, stale.resetAt); // day N's unit — too late

    // Day N+1 must still cap at dailyLimit total (1 already spent above).
    for (let i = 0; i < llm.dailyLimit - 1; i++) {
      expect((await consumeSummaryBudget(userId)).allowed).toBe(true);
    }
    expect((await consumeSummaryBudget(userId)).allowed).toBe(false);
  });
});
