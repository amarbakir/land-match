import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { ApiErrorEnvelopeType } from '@landmatch/api';
import { ErrorCode, ErrorMessage } from '@landmatch/api';

import { captureError } from '../lib/captureError';

export interface RateLimitWindow {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimitStore {
  /** Record one hit against the key, opening a fresh window if the current one expired. */
  increment(key: string, windowMs: number): Promise<RateLimitWindow>;
}

// Sweep expired entries once the map grows past this size, so long-running
// processes don't accumulate one entry per client IP forever.
const SWEEP_THRESHOLD = 10_000;

/** Per-process store. Fine for a single instance and unit tests; horizontally
 *  scaled deployments must use a shared store or limits multiply per instance. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, RateLimitWindow>();

  async increment(key: string, windowMs: number): Promise<RateLimitWindow> {
    const now = Date.now();

    let entry = this.windows.get(key);
    if (!entry || now >= entry.resetAt) {
      if (this.windows.size >= SWEEP_THRESHOLD) {
        for (const [k, v] of this.windows) {
          if (now >= v.resetAt) this.windows.delete(k);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, entry);
    }

    entry.count++;
    return entry;
  }
}

// hono/aws-lambda puts the Function URL / API Gateway event on c.env; its
// sourceIp is stamped by AWS and cannot be forged by the caller.
function lambdaSourceIp(c: Context): string | undefined {
  const env = c.env as { event?: { requestContext?: { http?: { sourceIp?: string } } } } | undefined;
  return env?.event?.requestContext?.http?.sourceIp;
}

function socketAddress(c: Context): string | undefined {
  try {
    // Cast: @hono/node-server resolves its own hono copy, so its Context type
    // is not identical to ours even though the runtime shape is.
    return getConnInfo(c as unknown as Parameters<typeof getConnInfo>[0]).remote.address;
  } catch {
    return undefined; // not running under @hono/node-server
  }
}

/**
 * Resolve a client IP the caller cannot control. Never trusts client-supplied
 * X-Forwarded-For entries: an attacker rotating the header must not get a
 * fresh rate-limit window per request.
 */
function resolveClientIp(c: Context, trustProxy: boolean): string {
  const fromLambda = lambdaSourceIp(c);
  if (fromLambda) return fromLambda;

  if (trustProxy) {
    // Behind the ALB (Fargate stages) the rightmost X-Forwarded-For entry is
    // the one hop the load balancer itself appended; everything left of it is
    // client-controlled.
    const xff = c.req.header('x-forwarded-for');
    const rightmost = xff?.split(',').pop()?.trim();
    if (rightmost) return rightmost;
  }

  return socketAddress(c) ?? 'unknown';
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Keyspace prefix so limiters sharing one store never collide (e.g. 'auth', 'enrich'). */
  scope: string;
  /** Defaults to a per-limiter in-memory store. */
  store?: RateLimitStore;
  /** Trust the rightmost X-Forwarded-For hop (set when behind the ALB). */
  trustProxy?: boolean;
}

/**
 * Fixed-window rate limiter keyed by trusted client IP.
 */
export function rateLimit({ windowMs, max, scope, store, trustProxy = false }: RateLimitOptions): MiddlewareHandler {
  const backing = store ?? new InMemoryRateLimitStore();
  // Degraded mode for shared-store outages: per-instance limiting is weaker
  // than shared limiting, but "no limiting at all" would strip brute-force
  // protection from credential endpoints exactly when the DB is struggling.
  const fallback = new InMemoryRateLimitStore();

  return async (c, next) => {
    const key = `${scope}:${resolveClientIp(c, trustProxy)}`;

    let entry: RateLimitWindow;
    try {
      entry = await backing.increment(key, windowMs);
    } catch (e) {
      captureError(e, 'rateLimit: store increment failed, using in-memory fallback');
      entry = await fallback.increment(key, windowMs);
    }

    if (entry.count > max) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000))));
      const body = { ok: false, code: ErrorCode.RATE_LIMITED, error: ErrorMessage.RATE_LIMITED } satisfies ApiErrorEnvelopeType;
      return c.json(body, 429);
    }

    await next();
  };
}
