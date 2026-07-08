import { sql } from 'drizzle-orm';
import { rateLimits } from '@landmatch/db';

import { captureError } from '../lib/captureError';
import { db } from '../db/client';
import type { RateLimitStore, RateLimitWindow } from '../middleware/rateLimit';

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Shared fixed-window counters in Postgres: one atomic upsert per hit, so
 * limits hold across Fargate tasks and Lambda containers instead of
 * multiplying with instance concurrency.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private lastSweepAt = 0;

  async increment(key: string, windowMs: number): Promise<RateLimitWindow> {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: new Date(Date.now() + windowMs) })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN 1 ELSE ${rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN excluded.reset_at ELSE ${rateLimits.resetAt} END`,
        },
      })
      .returning();

    // Opportunistic sweep (at most once a minute per process): without it the
    // table grows by one row per client IP forever. Done here rather than in
    // the cron scheduler because the Lambda stages — the ones that need this
    // store — never run the scheduler.
    const now = Date.now();
    if (now - this.lastSweepAt >= SWEEP_INTERVAL_MS) {
      this.lastSweepAt = now;
      void db
        .delete(rateLimits)
        .where(sql`${rateLimits.resetAt} <= now() - interval '1 hour'`)
        .catch((e) => captureError(e, 'rateLimitRepo: expired-window sweep failed'));
    }

    return { count: row.count, resetAt: row.resetAt.getTime() };
  }
}
