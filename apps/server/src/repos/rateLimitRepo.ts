import { sql } from 'drizzle-orm';
import { rateLimits } from '@landmatch/db';

import { db } from '../db/client';
import type { RateLimitStore, RateLimitWindow } from '../middleware/rateLimit';

/**
 * Shared fixed-window counters in Postgres: one atomic upsert per hit, so
 * limits hold across Fargate tasks and Lambda containers instead of
 * multiplying with instance concurrency.
 */
export class PostgresRateLimitStore implements RateLimitStore {
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

    // Opportunistic sweep when a window opens, mirroring the in-memory store:
    // without it the table grows by one row per client IP forever.
    if (row.count === 1) {
      void db
        .delete(rateLimits)
        .where(sql`${rateLimits.resetAt} <= now() - interval '1 hour'`)
        .catch(() => { /* best-effort cleanup */ });
    }

    return { count: row.count, resetAt: row.resetAt.getTime() };
  }
}
