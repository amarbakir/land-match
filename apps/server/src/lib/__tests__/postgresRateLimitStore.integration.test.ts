import { describe, expect, it } from 'vitest';

import { PostgresRateLimitStore } from '../postgresRateLimitStore';

const WINDOW = 60_000;

describe('PostgresRateLimitStore (integration)', () => {
  it('shares one window across store instances', async () => {
    // Bug this catches: the per-process in-memory Map — under Lambda each
    // container has its own counters, so effective limits multiply with
    // concurrency. Two instances stand in for two containers.
    const containerA = new PostgresRateLimitStore();
    const containerB = new PostgresRateLimitStore();

    const first = await containerA.increment('auth:1.2.3.4', WINDOW);
    const second = await containerB.increment('auth:1.2.3.4', WINDOW);
    const third = await containerA.increment('auth:1.2.3.4', WINDOW);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2); // sees A's hit
    expect(third.count).toBe(3);
  });

  it('opens a fresh window after the current one expires', async () => {
    const store = new PostgresRateLimitStore();

    const first = await store.increment('auth:5.6.7.8', 50); // 50ms window
    expect(first.count).toBe(1);
    await store.increment('auth:5.6.7.8', 50);

    await new Promise((r) => setTimeout(r, 80));

    // Bug this catches: an upsert that always increments would lock a client
    // out forever once the limit is reached.
    const fresh = await store.increment('auth:5.6.7.8', WINDOW);
    expect(fresh.count).toBe(1);
    expect(fresh.resetAt).toBeGreaterThan(Date.now());
  });

  it('decrement returns one unit to the window it was consumed in', async () => {
    // Bug this catches: summary-budget refunds that never reach the shared
    // store — each Lambda container would refund only its own phantom copy.
    const store = new PostgresRateLimitStore();

    await store.increment('llm-summary:int-user', WINDOW);
    const consumed = await store.increment('llm-summary:int-user', WINDOW);
    await store.decrement('llm-summary:int-user', consumed.resetAt);

    const next = await store.increment('llm-summary:int-user', WINDOW);
    expect(next.count).toBe(2);
  });

  it('decrement scoped to a different window is a no-op', async () => {
    // Bug this catches (561 review): a refund straddling the window rollover
    // subtracting from the NEW window's count — budget minted across days.
    const store = new PostgresRateLimitStore();

    const live = await store.increment('llm-summary:int-stale', WINDOW);
    await store.decrement('llm-summary:int-stale', live.resetAt - 5_000); // stale window id

    const next = await store.increment('llm-summary:int-stale', WINDOW);
    expect(next.count).toBe(2); // untouched by the stale refund
  });

  it('decrement on a missing key mints no negative budget', async () => {
    const store = new PostgresRateLimitStore();

    await store.decrement('llm-summary:ghost', Date.now() + WINDOW);

    const first = await store.increment('llm-summary:ghost', WINDOW);
    expect(first.count).toBe(1);
  });

  it('counts keys independently', async () => {
    const store = new PostgresRateLimitStore();

    await store.increment('auth:9.9.9.9', WINDOW);
    const otherScope = await store.increment('enrich:9.9.9.9', WINDOW);
    const otherIp = await store.increment('auth:8.8.8.8', WINDOW);

    expect(otherScope.count).toBe(1);
    expect(otherIp.count).toBe(1);
  });
});
