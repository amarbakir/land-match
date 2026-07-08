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

  it('counts keys independently', async () => {
    const store = new PostgresRateLimitStore();

    await store.increment('auth:9.9.9.9', WINDOW);
    const otherScope = await store.increment('enrich:9.9.9.9', WINDOW);
    const otherIp = await store.increment('auth:8.8.8.8', WINDOW);

    expect(otherScope.count).toBe(1);
    expect(otherIp.count).toBe(1);
  });
});
