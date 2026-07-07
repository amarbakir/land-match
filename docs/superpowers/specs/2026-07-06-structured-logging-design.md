# Structured Logging — Design

**Date:** 2026-07-06
**Bead:** land-match-r31 (Monitoring & Observability epic — structured logging item)
**Status:** Approved

## Goal

Replace all `console.*` usage in `apps/server` (~40 call sites across 13 files) with structured, leveled logging, and add a per-request HTTP access log. This is the foundation for the rest of the r31 epic (metrics, error tracking, uptime probes), which stays out of scope here.

## Decisions

- **Library:** pino (runtime dep) + pino-pretty (dev dep, loaded only outside production).
- **Access log:** every request gets one structured line on completion.
- **Scope:** server only. `packages/enrichment` and `packages/scoring` have no console usage and are untouched.

## Components

### 1. Logger core — `apps/server/src/lib/logger.ts`

Root pino instance, exported as `logger`.

- Reads `process.env.NODE_ENV` / `process.env.LOG_LEVEL` directly — NOT `config.ts` — so `config.ts` can itself use the logger without a circular import.
- Level defaults: `debug` in development, `info` in production, `silent` when `NODE_ENV === 'test'` (keeps vitest output pristine). `LOG_LEVEL` env overrides all.
- Output: pino-pretty transport in development; plain JSON to stdout in production and test.

### 2. Request-scoped logger

The existing request-ID middleware in `app.ts` additionally creates `logger.child({ requestId })` and sets it on context as `logger` (typed in `types/env.ts`). Handlers and middleware log through `c.get('logger')`; every line carries the request ID automatically.

### 3. Access log middleware — `apps/server/src/middleware/accessLog.ts`

Testable factory `accessLog(rootLogger)` returning Hono middleware. After `next()`:

- Fields: `method`, `path`, `status`, `durationMs` (from existing `startTime`), `requestId`, `userId` when set.
- Level by status: 2xx/3xx → `info`, 4xx → `warn`, 5xx → `error`.
- Paths starting with `/health` are excluded.

### 4. Call-site migration

All `console.log/warn/error` in `apps/server/src` move to the logger:

- Services, jobs/scheduler, db/client, geodataAdapters: module-level `import { logger } from '../lib/logger'`; errors logged as `logger.error({ err }, 'context message')` using pino's standard `err` serializer.
- `config.ts` (`validateConfig`, `required()` warning): logger import is safe given component 1.
- `app.ts` `onError`: logs via the request-scoped logger when available.
- `index.ts` startup lines.

## Testing

TDD on new units:

- **logger.ts**: level resolution from env (dev default, prod default, test silent, `LOG_LEVEL` override).
- **accessLog**: inject a stub logger; assert emitted fields, status→level mapping, `/health` exclusion.
- **Request-ID child**: request-scoped logger carries `requestId`.

Call-site migration is behavior-preserving; the existing server suite (132 tests) staying green is the check.

## Non-goals

- Metrics events (enrichment latency, geocode success rate) — separate r31 item.
- Error tracking (Sentry) — needs an account; separate r31 item.
- External API uptime probes — separate r31 item.
- Log shipping, rotation, redaction beyond pino defaults; frontend/extension logging.
