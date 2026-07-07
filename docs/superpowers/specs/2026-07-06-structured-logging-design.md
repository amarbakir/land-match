# Structured Logging + Sentry — Design

**Date:** 2026-07-06
**Bead:** land-match-r31 (Monitoring & Observability epic — structured logging + error tracking items)
**Status:** Approved (Sentry/Spotlight scope added per user request after initial approval)

## Goal

Replace all `console.*` usage in `apps/server` (~40 call sites across 13 files) with structured, leveled logging, add a per-request HTTP access log, and wire up Sentry error tracking with Spotlight for local development (mirroring the Compair repo's setup). Metrics and uptime probes stay out of scope.

## Decisions

- **Library:** pino (runtime dep) + pino-pretty (dev dep, loaded only outside production).
- **Access log:** every request gets one structured line on completion.
- **Error tracking:** `@sentry/node`, DSN-optional. Locally, Spotlight (`SENTRY_SPOTLIGHT=1` + `npx @spotlightjs/spotlight` UI) gives error/trace visibility with no account; for beta/prod the user sets `SENTRY_DSN`.
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

### 5. Sentry + Spotlight (Compair pattern)

- **Config** (`config.ts`): `sentry` block — `dsn` (`SENTRY_DSN`, default empty), `environment` (`SENTRY_ENVIRONMENT`, default `NODE_ENV`), `tracesSampleRate` (`SENTRY_TRACES_SAMPLE_RATE`, default 0.1), `spotlight` (`SENTRY_SPOTLIGHT=1|true`), `isConfigured` (dsn non-empty).
- **Init** (`apps/server/src/init.ts`): `initSentry()` — calls `Sentry.init` only when `isConfigured || spotlight`; passes dsn (or undefined), environment, tracesSampleRate, spotlight. Called first thing in `index.ts`.
- **Capture points:** `app.ts` `onError` (`Sentry.captureException(err)`); `index.ts` `unhandledRejection`/`uncaughtException` (capture + `Sentry.flush(2000)` before exit); scheduler catch block.
- **Request tagging:** `requestLogging` middleware sets `Sentry.getCurrentScope().setTag('requestId', requestId)`.
- **Scripts:** server `dev:debugging` (`SENTRY_SPOTLIGHT=1 pnpm dev`); root `dev:debugging` runs server + `npx @spotlightjs/spotlight`; `@spotlightjs/spotlight` as root dev dep.
- **Not included:** shipping pino logs to Sentry (errors are captured at boundaries; logs stay on stdout).

## Testing

TDD on new units:

- **logger.ts**: level resolution from env (dev default, prod default, test silent, `LOG_LEVEL` override).
- **accessLog**: inject a stub logger; assert emitted fields, status→level mapping, `/health` exclusion.
- **Request-ID child**: request-scoped logger carries `requestId`.
- **Sentry config**: spotlight flag parsing, `isConfigured`, sample-rate default.
- **initSentry**: mocked `@sentry/node` — init called when DSN or spotlight set, skipped otherwise.
- **onError capture**: mocked `@sentry/node` — `captureException` called for unhandled route errors.

Call-site migration is behavior-preserving; the existing server suite (132 tests) staying green is the check.

## Non-goals

- Metrics events (enrichment latency, geocode success rate) — separate r31 item.
- External API uptime probes — separate r31 item.
- Shipping pino logs to Sentry/Spotlight (error boundaries only for now).
- Log shipping, rotation, redaction beyond pino defaults; frontend/extension logging.
