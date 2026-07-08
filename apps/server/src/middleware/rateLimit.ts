import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { ApiErrorEnvelopeType } from '@landmatch/api';
import { ErrorCode, ErrorMessage } from '@landmatch/api';

import { captureError } from '../lib/captureError';
import { InMemoryRateLimitStore, type RateLimitStore, type RateLimitWindow } from '../lib/rateLimitStore';

/** The slice of the hono/aws-lambda binding this middleware reads. Test
 *  helpers fabricate this exact type so shape drift is a compile error. */
export type LambdaRequestEnv = {
  event?: { requestContext?: { http?: { sourceIp?: string } } };
};

// The Function URL / API Gateway event's sourceIp is stamped by AWS and
// cannot be forged by the caller.
function lambdaSourceIp(c: Context): string | undefined {
  return (c.env as LambdaRequestEnv | undefined)?.event?.requestContext?.http?.sourceIp;
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
  // (The default in-memory backing never throws, so it needs no fallback.)
  const fallback = store ? new InMemoryRateLimitStore() : backing;

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
