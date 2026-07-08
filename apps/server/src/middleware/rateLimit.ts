import type { MiddlewareHandler } from 'hono';
import type { ApiErrorEnvelopeType } from '@landmatch/api';
import { ErrorCode, ErrorMessage } from '@landmatch/api';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// Sweep expired entries once the map grows past this size, so long-running
// processes don't accumulate one entry per client IP forever.
const SWEEP_THRESHOLD = 10_000;

function clientKey(forwardedFor: string | undefined, realIp: string | undefined): string {
  return forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';
}

/**
 * Fixed-window in-memory rate limiter keyed by client IP.
 * Per-process state — sufficient for a single-instance deployment.
 */
export function rateLimit({ windowMs, max }: RateLimitOptions): MiddlewareHandler {
  const windows = new Map<string, WindowEntry>();

  return async (c, next) => {
    const key = clientKey(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));
    const now = Date.now();

    let entry = windows.get(key);
    if (!entry || now >= entry.resetAt) {
      if (windows.size >= SWEEP_THRESHOLD) {
        for (const [k, v] of windows) {
          if (now >= v.resetAt) windows.delete(k);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }

    entry.count++;
    if (entry.count > max) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      const body = { ok: false, code: ErrorCode.RATE_LIMITED, error: ErrorMessage.RATE_LIMITED } satisfies ApiErrorEnvelopeType;
      return c.json(body, 429);
    }

    await next();
  };
}
