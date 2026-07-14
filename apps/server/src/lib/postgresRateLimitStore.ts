import { and, eq, lte, sql } from 'drizzle-orm';
import { rateLimits } from '@landmatch/db';

import { runBestEffort } from './captureError';
import { db } from '../db/client';
import type { RateLimitStore, RateLimitWindow } from './rateLimitStore';

const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_GRACE_MS = 60 * 60_000;

/**
 * Shared fixed-window counters in Postgres: one atomic upsert per hit, so
 * limits hold across Fargate tasks and Lambda containers instead of
 * multiplying with instance concurrency. All window boundaries use the
 * database clock — mixing in the app clock would let NTP skew between an
 * instance and Postgres silently stretch or disable the window.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private lastSweepAt = 0;

  async increment(key: string, windowMs: number): Promise<RateLimitWindow> {
    // ms-truncated: resetAt round-trips through the JS epoch-ms in
    // RateLimitWindow and back into decrement's equality check — microsecond
    // residue would make every refund silently miss its window.
    const windowInterval = sql`date_trunc('milliseconds', now() + make_interval(secs => ${windowMs / 1000}))`;

    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: windowInterval })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN 1 ELSE ${rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN ${windowInterval} ELSE ${rateLimits.resetAt} END`,
        },
      })
      .returning();

    // Sweep expired rows (at most once a minute per process): without it the
    // table grows by one row per client IP forever. Done inline rather than in
    // the cron scheduler because the Lambda stages — the ones that need this
    // store — never run the scheduler; awaited because Lambda freezes the
    // container as soon as the response settles, which would strand a
    // fire-and-forget DELETE mid-flight.
    const now = Date.now();
    if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) {
      this.lastSweepAt = now;
      await runBestEffort('postgresRateLimitStore: expired-window sweep failed', () =>
        db.delete(rateLimits).where(lte(rateLimits.resetAt, new Date(now - SWEEP_GRACE_MS))),
      );
    }

    return { count: row.count, resetAt: row.resetAt.getTime() };
  }

  async decrement(key: string, resetAt: number): Promise<void> {
    // Floored at 0 and scoped to the exact window the unit was consumed in:
    // refunding into a successor window would mint budget across days.
    await db
      .update(rateLimits)
      .set({ count: sql`GREATEST(${rateLimits.count} - 1, 0)` })
      .where(and(eq(rateLimits.key, key), eq(rateLimits.resetAt, new Date(resetAt))));
  }
}
