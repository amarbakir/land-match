# Structured Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `console.*` usage in `apps/server` with pino structured logging, with request-scoped child loggers and a per-request access log.

**Architecture:** A root pino logger (`lib/logger.ts`) reads env directly (no `config.ts` import, avoiding a cycle). A single `requestLogging` middleware sets `requestId`, `startTime`, and a child logger on Hono context, then emits one access-log line per completed request. All existing `console.*` call sites migrate to the logger.

**Tech Stack:** pino (runtime), pino-pretty (dev-only), Hono 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-structured-logging-design.md` — Bead: `land-match-r31.1`

## Global Constraints

- Use `pnpm`, never npm/yarn. Run server tests from `apps/server` with `npx vitest run <file>` or from root with `pnpm --filter @landmatch/server test`.
- Log levels: `LOG_LEVEL` env overrides everything; otherwise `test` → `silent`, `production` → `info`, else `debug`.
- pino-pretty transport only when NOT production and NOT test (JSON in prod, silent/plain in test).
- Error objects always logged as `{ err }` (pino's standard serializer key), message describes the failing operation.
- Existing behavior preserved: same `Result` returns, same HTTP responses. Only logging output changes.
- Commit after each task; message format `land-match-r31.1: <what>`.

---

### Task 1: Logger core

**Files:**
- Create: `apps/server/src/lib/logger.ts`
- Test: `apps/server/src/__tests__/logger.test.ts`
- Modify: `apps/server/package.json` (deps via pnpm)

**Interfaces:**
- Produces: `resolveLogLevel(nodeEnv: string | undefined, logLevel: string | undefined): string`; `logger` (root pino instance); `type Logger` (re-export of pino's `Logger`). Later tasks import `{ logger }` and `type { Logger }` from `../lib/logger`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @landmatch/server add pino
pnpm --filter @landmatch/server add -D pino-pretty
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/__tests__/logger.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { logger, resolveLogLevel } from '../lib/logger';

describe('resolveLogLevel', () => {
  it('honors LOG_LEVEL over everything', () => {
    expect(resolveLogLevel('production', 'trace')).toBe('trace');
  });

  it('is silent under test', () => {
    expect(resolveLogLevel('test', undefined)).toBe('silent');
  });

  it('defaults to info in production', () => {
    expect(resolveLogLevel('production', undefined)).toBe('info');
  });

  it('defaults to debug in development', () => {
    expect(resolveLogLevel('development', undefined)).toBe('debug');
    expect(resolveLogLevel(undefined, undefined)).toBe('debug');
  });
});

describe('logger', () => {
  it('is silent when running under vitest (NODE_ENV=test)', () => {
    expect(logger.level).toBe('silent');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/__tests__/logger.test.ts`
Expected: FAIL — `Cannot find module '../lib/logger'`

- [ ] **Step 4: Write minimal implementation**

Create `apps/server/src/lib/logger.ts`:

```typescript
import 'dotenv/config';
import pino from 'pino';

export type { Logger } from 'pino';

/**
 * Reads env directly (not config.ts) so config.ts can log without a
 * circular import. LOG_LEVEL wins; otherwise test → silent,
 * production → info, else debug.
 */
export function resolveLogLevel(
  nodeEnv: string | undefined,
  logLevel: string | undefined,
): string {
  if (logLevel) return logLevel;
  if (nodeEnv === 'test') return 'silent';
  if (nodeEnv === 'production') return 'info';
  return 'debug';
}

const nodeEnv = process.env.NODE_ENV;
const usePretty = nodeEnv !== 'production' && nodeEnv !== 'test';

export const logger = pino({
  level: resolveLogLevel(nodeEnv, process.env.LOG_LEVEL),
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
```

Note: `import 'dotenv/config'` is required — logger.ts may be imported before config.ts runs `dotenv.config()`, and `LOG_LEVEL` can live in `.env`. dotenv is idempotent.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/__tests__/logger.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/logger.ts apps/server/src/__tests__/logger.test.ts apps/server/package.json pnpm-lock.yaml
git commit -m "land-match-r31.1: add pino logger core"
```

---

### Task 2: requestLogging middleware (request ID + child logger + access log)

**Files:**
- Create: `apps/server/src/middleware/requestLogging.ts`
- Test: `apps/server/src/__tests__/requestLogging.test.ts`
- Modify: `apps/server/src/types/env.ts`

**Interfaces:**
- Consumes: `type Logger` from Task 1.
- Produces: `requestLogging(rootLogger: Logger): MiddlewareHandler<Env>` and `generateRequestId(existing?: string | null): string`. Sets context variables `requestId: string`, `startTime: number`, `logger: Logger`. Task 3 wires this into `app.ts` and deletes `middleware/logging.ts` (whose `generateRequestId` moves here).

- [ ] **Step 1: Add `logger` to context variable types**

Modify `apps/server/src/types/env.ts`:

```typescript
import type { Logger } from '../lib/logger';

export type Env = {
  Variables: {
    requestId: string;
    startTime: number;
    userId: string;
    logger: Logger;
  };
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/__tests__/requestLogging.test.ts`:

```typescript
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../lib/logger';
import { requestLogging, generateRequestId } from '../middleware/requestLogging';
import type { Env } from '../types/env';

const childLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const rootLogger = {
  child: vi.fn(() => childLogger),
} as unknown as Logger;

function buildApp() {
  const app = new Hono<Env>();
  app.use('*', requestLogging(rootLogger));
  app.get('/ok', (c) => c.json({ requestId: c.get('requestId') }));
  app.get('/missing', (c) => c.json({ ok: false }, 404));
  app.get('/boom', (c) => c.json({ ok: false }, 500));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateRequestId', () => {
  it('returns the existing id when provided', () => {
    expect(generateRequestId('abc')).toBe('abc');
  });

  it('generates a uuid when missing', () => {
    expect(generateRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('requestLogging', () => {
  it('creates a child logger bound to the request id and logs the request', async () => {
    const app = buildApp();
    const res = await app.request('/ok', { headers: { 'x-request-id': 'req-1' } });

    expect(res.status).toBe(200);
    expect(rootLogger.child).toHaveBeenCalledWith({ requestId: 'req-1' });
    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/ok',
        status: 200,
        durationMs: expect.any(Number),
      }),
      'request completed',
    );
  });

  it('exposes requestId to handlers via context', async () => {
    const app = buildApp();
    const res = await app.request('/ok', { headers: { 'x-request-id': 'req-2' } });
    expect(await res.json()).toEqual({ requestId: 'req-2' });
  });

  it('logs 4xx at warn and 5xx at error', async () => {
    const app = buildApp();

    await app.request('/missing');
    expect(childLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      'request completed',
    );

    await app.request('/boom');
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      'request completed',
    );
  });

  it('does not log health check requests', async () => {
    const app = buildApp();
    await app.request('/health');

    expect(childLogger.info).not.toHaveBeenCalled();
    expect(childLogger.warn).not.toHaveBeenCalled();
    expect(childLogger.error).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/__tests__/requestLogging.test.ts`
Expected: FAIL — `Cannot find module '../middleware/requestLogging'`

- [ ] **Step 4: Write minimal implementation**

Create `apps/server/src/middleware/requestLogging.ts`:

```typescript
import { randomUUID } from 'crypto';
import type { MiddlewareHandler } from 'hono';

import type { Logger } from '../lib/logger';
import type { Env } from '../types/env';

export function generateRequestId(existing?: string | null): string {
  return existing || randomUUID();
}

/**
 * Sets requestId, startTime, and a request-scoped child logger on context,
 * then emits one access-log line per completed request.
 * Health checks are excluded from the access log.
 */
export function requestLogging(rootLogger: Logger): MiddlewareHandler<Env> {
  return async (c, next) => {
    const requestId = generateRequestId(c.req.header('x-request-id'));
    const requestLogger = rootLogger.child({ requestId });

    c.set('requestId', requestId);
    c.set('startTime', Date.now());
    c.set('logger', requestLogger);

    await next();

    if (c.req.path.startsWith('/health')) return;

    const status = c.res.status;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    requestLogger[level](
      {
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - c.get('startTime'),
        userId: c.get('userId'),
      },
      'request completed',
    );
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/__tests__/requestLogging.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/middleware/requestLogging.ts apps/server/src/__tests__/requestLogging.test.ts apps/server/src/types/env.ts
git commit -m "land-match-r31.1: add requestLogging middleware with access log"
```

---

### Task 3: Wire into app.ts, migrate onError, delete old logging middleware

**Files:**
- Modify: `apps/server/src/app.ts`
- Delete: `apps/server/src/middleware/logging.ts`

**Interfaces:**
- Consumes: `logger` from Task 1; `requestLogging` from Task 2.
- Produces: app-wide request logging; `onError` logs through the request-scoped logger.

- [ ] **Step 1: Update app.ts**

In `apps/server/src/app.ts`:

Replace the imports:

```typescript
import { generateRequestId } from './middleware/logging';
```

with:

```typescript
import { logger } from './lib/logger';
import { requestLogging } from './middleware/requestLogging';
```

Replace the inline request-ID middleware:

```typescript
  // Request ID + timing
  app.use('*', async (c, next) => {
    const requestId = generateRequestId(c.req.header('x-request-id'));
    c.set('requestId', requestId);
    c.set('startTime', Date.now());
    await next();
  });
```

with:

```typescript
  // Request ID + child logger + access log
  app.use('*', requestLogging(logger));
```

Replace the `console.error` line in `onError`:

```typescript
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
```

with:

```typescript
    (c.get('logger') ?? logger).error({ err }, `unhandled error: ${c.req.method} ${c.req.path}`);
```

- [ ] **Step 2: Delete the old middleware**

```bash
rm apps/server/src/middleware/logging.ts
```

- [ ] **Step 3: Run the full server suite**

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS (no remaining imports of `middleware/logging`; if anything fails on that import, update it to `middleware/requestLogging`)

- [ ] **Step 4: Commit**

```bash
git add -A apps/server/src
git commit -m "land-match-r31.1: wire request logging into app, structured onError"
```

---

### Task 4: Migrate startup/infra call sites (index, config, db, scheduler, geodata)

**Files:**
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/db/client.ts`
- Modify: `apps/server/src/jobs/scheduler.ts`
- Modify: `apps/server/src/lib/geodataAdapters.ts`

**Interfaces:**
- Consumes: `logger` from Task 1. No new exports. Behavior-preserving; the existing suite is the check.

- [ ] **Step 1: index.ts**

Add `import { logger } from './lib/logger';`, delete the `getTimestamp()` helper (pino timestamps every line), and replace:

```typescript
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'unhandled rejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
```

In `startServer()`: `logger.info({ port: server.port }, 'Hono server running');`
In the catch: `logger.fatal({ err: error }, 'server start failed'); process.exit(1);`

- [ ] **Step 2: config.ts**

Add `import { logger } from './lib/logger';` (safe: logger.ts reads env directly and never imports config).

Replace in `required()`:
`console.warn(...)` → `logger.warn(\`${name} not set, some features may not work\`);`

Replace `validateConfig()` body lines:

```typescript
  logger.info(
    {
      env: server.nodeEnv,
      database: database.url ? 'configured' : 'NOT SET',
      auth: auth.jwtSecret ? 'configured' : 'NOT configured',
      emailFrom: email.fromAddress,
    },
    'config loaded',
  );
```

- [ ] **Step 3: db/client.ts**

Add logger import (`../lib/logger`). Replace:
- `console.log('Migrations folder:', migrationsFolder)` → `logger.info({ migrationsFolder }, 'running database migrations')`
- `console.log('Database migrations completed')` → `logger.info('database migrations completed')`
- `console.error('Failed to run database migrations:', error)` → `logger.error({ err: error }, 'database migrations failed')`

- [ ] **Step 4: jobs/scheduler.ts**

Add logger import (`../lib/logger`). Replace each call site:
- Start line → `logger.info({ schedule: email.deliveryCronSchedule }, 'starting email delivery cron')`
- Skip line → `logger.info('skipping delivery — previous run still in progress')`
- Failed with elapsed → `logger.error({ durationMs: Date.now() - startTime, err: result.error }, 'email delivery failed')` (delete the `elapsed` string; compute nothing else)
- Complete line → `logger.info({ durationMs: Date.now() - startTime, emails: result.data.emailsSent, alerts: result.data.alertsProcessed, errors: result.data.errors.length }, 'email delivery complete')`
- Errors warn → `logger.warn({ errors: result.data.errors.slice(0, 10) }, 'delivery errors')`
- Catch → `logger.error({ err: error }, 'email delivery failed')`

- [ ] **Step 5: lib/geodataAdapters.ts**

Add logger import (`./logger`). Replace:
`console.log('[geodata] Registered PostGIS...')` → `logger.info('registered PostGIS enrichment adapters: climateNormals, elevation, wetlands')`

- [ ] **Step 6: Verify no console left in these files, suite green**

Run: `grep -rn "console\." apps/server/src/index.ts apps/server/src/config.ts apps/server/src/db/client.ts apps/server/src/jobs/scheduler.ts apps/server/src/lib/geodataAdapters.ts`
Expected: no output

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src
git commit -m "land-match-r31.1: migrate startup/infra logging to pino"
```

---

### Task 5: Migrate service call sites

**Files:**
- Modify: `apps/server/src/services/alertDeliveryService.ts`, `authService.ts`, `listingService.ts`, `matchService.ts`, `matchingService.ts`, `searchProfileService.ts`, `userService.ts`

**Interfaces:**
- Consumes: `logger` from Task 1. Behavior-preserving.

- [ ] **Step 1: Apply the uniform pattern to every service**

Each service adds `import { logger } from '../lib/logger';`. Every `console.error('[<tag>]', error)` becomes `logger.error({ err: error }, '<tag>')` — the bracketed tag string becomes the message, the error becomes `err`. Exact list:

| File | Line (pre-edit) | Replacement |
|---|---|---|
| alertDeliveryService.ts | `console.error('[alertDeliveryService.deliverPendingAlerts]', error)` | `logger.error({ err: error }, 'alertDeliveryService.deliverPendingAlerts')` |
| matchingService.ts | `console.error('[matchingService.matchListingAgainstProfiles]', error)` | `logger.error({ err: error }, 'matchingService.matchListingAgainstProfiles')` |
| authService.ts (×3: register/login/refresh) | `console.error('[authService.<fn>]', e)` | `logger.error({ err: e }, 'authService.<fn>')` |
| listingService.ts | `console.error('[listingService] background matching failed:', e)` | `logger.error({ err: e }, 'listingService: background matching failed')` |
| listingService.ts | `console.error('[listingService.enrichAndPersist] Unexpected error:', error)` | `logger.error({ err: error }, 'listingService.enrichAndPersist')` |
| listingService.ts (×2: getSavedListings/unsaveListing) | `console.error('[listingService.<fn>]', error)` | `logger.error({ err: error }, 'listingService.<fn>')` |
| matchService.ts (×4: getMatchDetail/getMatches/updateMatchStatus/getProfileCounts) | `console.error('[matchService.<fn>]', error)` | `logger.error({ err: error }, 'matchService.<fn>')` |
| searchProfileService.ts (×5: create/getById/listByUser/update/remove) | `console.error('[searchProfileService.<fn>]', error)` | `logger.error({ err: error }, 'searchProfileService.<fn>')` |
| userService.ts (×2: getNotificationPrefs/updateNotificationPrefs) | `console.error('[userService.<fn>]', error)` | `logger.error({ err: error }, 'userService.<fn>')` |

- [ ] **Step 2: Verify zero console.* left in apps/server/src, suite green**

Run: `grep -rn "console\." apps/server/src --include="*.ts" | grep -v __tests__`
Expected: no output

Run: `cd apps/server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services
git commit -m "land-match-r31.1: migrate service logging to pino"
```

---

### Task 6: Full verification

**Files:** none new.

- [ ] **Step 1: Full test + lint + build**

Run from repo root:

```bash
pnpm --filter @landmatch/server test
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Boot the server and eyeball output**

Run: `pnpm dev:server` (Ctrl-C after checking). Expected: pretty-printed startup lines (config loaded, migrations, scheduler, server running) instead of raw `console.log` — then hit `curl localhost:3000/health` (no access log line) and `curl localhost:3000/api/v1/listings/by-url?url=x` (one access-log line with requestId, status, durationMs).

- [ ] **Step 3: Final commit if anything was fixed**

```bash
git add -A && git commit -m "land-match-r31.1: verification fixes"
```

(Skip if the tree is clean.)
