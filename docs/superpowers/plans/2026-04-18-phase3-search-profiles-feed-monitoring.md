# Phase 3: Search Profiles & Feed Monitoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search profile CRUD, automated RSS feed ingestion from two land listing sites, cron-based enrichment, and criteria matching that scores listings against profiles and creates pending alerts.

**Architecture:** Four layers built bottom-up: (1) Zod schemas in `@landmatch/api` as single source of truth for SearchCriteria, (2) new `@landmatch/feeds` package with adapter pattern for RSS ingestion, (3) server CRUD + repos for profiles/scores/alerts, (4) feed pipeline service orchestrating ingest → enrich → match as an in-process `node-cron` job.

**Tech Stack:** Hono 4, Zod 4, Drizzle ORM, node-cron, rss-parser, Vitest

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `packages/api/src/searchProfiles.ts` | SearchCriteria, CreateSearchProfile, UpdateSearchProfile, SearchProfileResponse Zod schemas |
| `packages/feeds/package.json` | Package config for `@landmatch/feeds` |
| `packages/feeds/tsconfig.json` | TypeScript config |
| `packages/feeds/src/index.ts` | Public exports |
| `packages/feeds/src/types.ts` | FeedAdapter interface, RawListing type, FeedIngestionResult |
| `packages/feeds/src/orchestrator.ts` | Runs all adapters via Promise.allSettled |
| `packages/feeds/src/adapters/landwatch.ts` | LandWatch RSS adapter |
| `packages/feeds/src/adapters/land-com.ts` | Land.com RSS adapter |
| `packages/feeds/src/__tests__/orchestrator.test.ts` | Orchestrator unit tests |
| `packages/feeds/src/__tests__/landwatch.test.ts` | LandWatch adapter unit tests |
| `packages/feeds/src/__tests__/land-com.test.ts` | Land.com adapter unit tests |
| `apps/server/src/repos/searchProfileRepo.ts` | Search profile CRUD queries |
| `apps/server/src/repos/scoreRepo.ts` | Score persistence + queries |
| `apps/server/src/repos/alertRepo.ts` | Alert persistence + queries |
| `apps/server/src/services/searchProfileService.ts` | Profile business logic + ownership validation |
| `apps/server/src/services/matchingService.ts` | Score listing against all active profiles, create alerts |
| `apps/server/src/services/feedPipelineService.ts` | Three-stage pipeline: ingest → enrich → match |
| `apps/server/src/routes/searchProfiles.ts` | Profile CRUD endpoints |
| `apps/server/src/jobs/scheduler.ts` | node-cron setup, overlap guard |
| `apps/server/src/__tests__/searchProfileService.test.ts` | Profile service unit tests |
| `apps/server/src/__tests__/matchingService.test.ts` | Matching service unit tests |
| `apps/server/src/__tests__/feedPipelineService.test.ts` | Pipeline service unit tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/api/src/index.ts` | Export new search profile schemas and SearchCriteria type |
| `packages/scoring/src/types.ts` | Remove hand-written SearchCriteria, import from `@landmatch/api` |
| `packages/scoring/src/index.ts` | Re-export SearchCriteria from `@landmatch/api` instead of local |
| `packages/scoring/package.json` | Add `@landmatch/api` dependency |
| `packages/db/src/schema.ts` | Add unique index on listings(external_id, source) |
| `apps/server/src/repos/listingRepo.ts` | Add `upsertFromFeed()`, `findPendingEnrichment()`, `findListingWithEnrichment()` |
| `apps/server/src/app.ts` | Mount search profiles router |
| `apps/server/src/index.ts` | Start scheduler after server starts |
| `apps/server/src/config.ts` | Add feed pipeline config (cron schedule, enrichment concurrency) |
| `apps/server/package.json` | Add `@landmatch/feeds` dependency, `rss-parser` |
| `pnpm-workspace.yaml` | Already includes `packages/*` — no change needed |

---

## Task 1: SearchCriteria Zod Schema + Scoring Migration

**Files:**
- Create: `packages/api/src/searchProfiles.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `packages/scoring/src/types.ts`
- Modify: `packages/scoring/src/index.ts`
- Modify: `packages/scoring/package.json`

- [ ] **Step 1: Create search profile schemas in `@landmatch/api`**

Create `packages/api/src/searchProfiles.ts`:

```typescript
import { z } from 'zod';

export const SearchCriteria = z.object({
  acreage: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  price: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  soilCapabilityClass: z.object({ max: z.number() }).optional(),
  floodZoneExclude: z.array(z.string()).optional(),
  geography: z
    .object({
      type: z.enum(['radius', 'counties', 'driveTime']),
      center: z.object({ lat: z.number(), lng: z.number() }).optional(),
      radiusMiles: z.number().optional(),
    })
    .optional(),
  zoning: z.array(z.string()).optional(),
  infrastructure: z.array(z.string()).optional(),
  climateRisk: z
    .object({
      maxFireRisk: z.number().optional(),
      maxFloodRisk: z.number().optional(),
    })
    .optional(),
  weights: z.record(z.string(), z.number()).optional(),
});

export type SearchCriteria = z.infer<typeof SearchCriteria>;

export const CreateSearchProfile = z.object({
  name: z.string().min(1),
  alertFrequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
  alertThreshold: z.number().int().min(0).max(100).default(60),
  criteria: SearchCriteria,
  isActive: z.boolean().default(true),
});

export type CreateSearchProfile = z.infer<typeof CreateSearchProfile>;

export const UpdateSearchProfile = CreateSearchProfile.partial();

export type UpdateSearchProfile = z.infer<typeof UpdateSearchProfile>;

export const SearchProfileResponse = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  alertFrequency: z.string(),
  alertThreshold: z.number(),
  criteria: SearchCriteria,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SearchProfileResponse = z.infer<typeof SearchProfileResponse>;
```

- [ ] **Step 2: Export new schemas from `packages/api/src/index.ts`**

Add to existing exports:

```typescript
export {
  CreateSearchProfile,
  SearchCriteria,
  SearchProfileResponse,
  UpdateSearchProfile,
} from './searchProfiles';
```

- [ ] **Step 3: Add `@landmatch/api` dependency to scoring package**

In `packages/scoring/package.json`, add to `dependencies`:

```json
"@landmatch/api": "workspace:*"
```

- [ ] **Step 4: Migrate scoring types to use Zod-inferred SearchCriteria**

In `packages/scoring/src/types.ts`, remove the hand-written `SearchCriteria` interface (lines 41-55) and import from `@landmatch/api`:

```typescript
import type { SearchCriteria } from '@landmatch/api';

export type { SearchCriteria };
```

Keep all other types (`ComponentScores`, `ScoringWeights`, `DEFAULT_WEIGHTS`, `ScoringResult`, `ListingData`, `EnrichmentData`) unchanged.

- [ ] **Step 4b: Update scoring index.ts re-exports**

In `packages/scoring/src/index.ts`, the line:

```typescript
export type { ComponentScores, EnrichmentData, ListingData, ScoringResult, ScoringWeights, SearchCriteria } from './types';
```

stays the same — `SearchCriteria` is re-exported from `./types` which now re-exports it from `@landmatch/api`.

- [ ] **Step 5: Run scoring tests to verify no breakage**

Run: `pnpm --filter @landmatch/scoring test:run`

Expected: All existing tests pass. The inferred `SearchCriteria` type is structurally compatible with the old interface.

- [ ] **Step 6: Run full lint/build**

Run: `pnpm lint && pnpm build`

Expected: Clean pass across all packages.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/searchProfiles.ts packages/api/src/index.ts packages/scoring/src/types.ts packages/scoring/src/index.ts packages/scoring/package.json
git commit -m "feat(api): add SearchCriteria Zod schema, migrate scoring to use inferred type"
```

---

## Task 2: DB Schema — Unique Index on Listings

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add unique index to listings table**

In `packages/db/src/schema.ts`, add the import for `uniqueIndex`:

```typescript
import { boolean, jsonb, pgTable, text, timestamp, integer, real, uniqueIndex } from 'drizzle-orm/pg-core';
```

Then add the unique index to the `listings` table definition. Replace the closing `);` of the `listings` table with:

```typescript
}, (table) => [
  uniqueIndex('listings_external_id_source_idx').on(table.externalId, table.source),
]);
```

- [ ] **Step 2: Generate Drizzle migration**

Run: `pnpm --filter @landmatch/db db:generate`

Expected: A new migration file is created in `packages/db/drizzle/` with a `CREATE UNIQUE INDEX` statement.

- [ ] **Step 3: Verify migration SQL**

Read the generated migration file. It should contain:

```sql
CREATE UNIQUE INDEX "listings_external_id_source_idx" ON "listings" USING btree ("external_id","source");
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat(db): add unique index on listings(external_id, source) for feed dedup"
```

---

## Task 3: Search Profile Repo

**Files:**
- Create: `apps/server/src/repos/searchProfileRepo.ts`

- [ ] **Step 1: Create searchProfileRepo**

Create `apps/server/src/repos/searchProfileRepo.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { searchProfiles } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertSearchProfileInput {
  userId: string;
  name: string;
  alertFrequency: string;
  alertThreshold: number;
  criteria: Record<string, unknown>;
  isActive: boolean;
}

export async function insert(input: InsertSearchProfileInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(searchProfiles)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      alertFrequency: input.alertFrequency,
      alertThreshold: input.alertThreshold,
      criteria: input.criteria,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findFirst({
    where: eq(searchProfiles.id, id),
  });
}

export async function findByUserId(userId: string, tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findMany({
    where: eq(searchProfiles.userId, userId),
  });
}

export async function findActive(tx?: Tx) {
  return (tx ?? db).query.searchProfiles.findMany({
    where: eq(searchProfiles.isActive, true),
  });
}

export async function update(id: string, data: Partial<InsertSearchProfileInput>, tx?: Tx) {
  const [row] = await (tx ?? db)
    .update(searchProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(searchProfiles.id, id))
    .returning();

  return row ?? null;
}

export async function deleteById(id: string, tx?: Tx) {
  const [row] = await (tx ?? db)
    .delete(searchProfiles)
    .where(eq(searchProfiles.id, id))
    .returning();

  return row ?? null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @landmatch/server lint`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/repos/searchProfileRepo.ts
git commit -m "feat(server): add searchProfileRepo with CRUD operations"
```

---

## Task 4: Score Repo + Alert Repo

**Files:**
- Create: `apps/server/src/repos/scoreRepo.ts`
- Create: `apps/server/src/repos/alertRepo.ts`

- [ ] **Step 1: Create scoreRepo**

Create `apps/server/src/repos/scoreRepo.ts`:

```typescript
import { eq, and, desc } from 'drizzle-orm';
import { scores } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertScoreInput {
  listingId: string;
  searchProfileId: string;
  overallScore: number;
  componentScores: Record<string, number>;
  llmSummary?: string;
}

export async function insert(input: InsertScoreInput, tx?: Tx) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(scores)
    .values({
      id,
      listingId: input.listingId,
      searchProfileId: input.searchProfileId,
      overallScore: input.overallScore,
      componentScores: input.componentScores,
      llmSummary: input.llmSummary ?? null,
      scoredAt: new Date(),
    })
    .returning();

  return row;
}

export async function findByListingAndProfile(listingId: string, profileId: string, tx?: Tx) {
  return (tx ?? db).query.scores.findFirst({
    where: and(eq(scores.listingId, listingId), eq(scores.searchProfileId, profileId)),
  });
}

export async function findByProfileId(profileId: string, tx?: Tx) {
  return (tx ?? db)
    .select()
    .from(scores)
    .where(eq(scores.searchProfileId, profileId))
    .orderBy(desc(scores.overallScore));
}
```

- [ ] **Step 2: Create alertRepo**

Create `apps/server/src/repos/alertRepo.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { alerts } from '@landmatch/db';

import { db, type Tx } from '../db/client';
import { generateId } from '../lib/id';

export interface InsertAlertInput {
  userId: string;
  searchProfileId: string;
  listingId: string;
  scoreId: string;
  channel: string;
}

export async function insert(input: InsertAlertInput, tx?: Tx) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(alerts)
    .values({
      id,
      userId: input.userId,
      searchProfileId: input.searchProfileId,
      listingId: input.listingId,
      scoreId: input.scoreId,
      channel: input.channel,
      status: 'pending',
      createdAt: new Date(),
    })
    .returning();

  return row;
}

export async function findByListingAndProfile(listingId: string, profileId: string, tx?: Tx) {
  return (tx ?? db).query.alerts.findFirst({
    where: and(eq(alerts.listingId, listingId), eq(alerts.searchProfileId, profileId)),
  });
}

export async function findPendingByUser(userId: string, tx?: Tx) {
  return (tx ?? db).query.alerts.findMany({
    where: and(eq(alerts.userId, userId), eq(alerts.status, 'pending')),
  });
}
```

- [ ] **Step 3: Verify both compile**

Run: `pnpm --filter @landmatch/server lint`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/repos/scoreRepo.ts apps/server/src/repos/alertRepo.ts
git commit -m "feat(server): add scoreRepo and alertRepo"
```

---

## Task 5: Listing Repo Extensions

**Files:**
- Modify: `apps/server/src/repos/listingRepo.ts`

- [ ] **Step 1: Add upsertFromFeed and findPendingEnrichment**

Add these imports at the top of `apps/server/src/repos/listingRepo.ts`:

```typescript
import { eq, and, sql } from 'drizzle-orm';
```

(Replace the existing `import { eq } from 'drizzle-orm';`)

Add these functions after the existing `findListingById`:

```typescript
export interface UpsertFeedListingInput {
  externalId: string;
  source: string;
  url: string;
  title: string;
  description?: string;
  price?: number;
  acreage?: number;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  rawData: Record<string, unknown>;
}

export async function upsertFromFeed(input: UpsertFeedListingInput, tx?: Tx) {
  const id = generateId();
  const now = new Date();

  const [row] = await (tx ?? db)
    .insert(listings)
    .values({
      id,
      externalId: input.externalId,
      source: input.source,
      url: input.url,
      title: input.title,
      description: input.description ?? null,
      price: input.price ?? null,
      acreage: input.acreage ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      county: input.county ?? null,
      state: input.state ?? null,
      rawData: input.rawData,
      enrichmentStatus: 'pending',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [listings.externalId, listings.source],
      set: {
        lastSeenAt: now,
        title: input.title,
        description: input.description ?? null,
        price: input.price ?? null,
        acreage: input.acreage ?? null,
      },
    })
    .returning();

  return row;
}

export async function findPendingEnrichment(limit: number, tx?: Tx) {
  return (tx ?? db)
    .select()
    .from(listings)
    .where(eq(listings.enrichmentStatus, 'pending'))
    .limit(limit);
}

export async function updateEnrichmentStatus(id: string, status: string, tx?: Tx) {
  await (tx ?? db)
    .update(listings)
    .set({ enrichmentStatus: status })
    .where(eq(listings.id, id));
}

export async function findListingWithEnrichment(id: string, tx?: Tx) {
  const listing = await (tx ?? db).query.listings.findFirst({
    where: eq(listings.id, id),
  });
  if (!listing) return null;

  const enrichment = await (tx ?? db).query.enrichments.findFirst({
    where: eq(enrichments.listingId, id),
  });

  return { listing, enrichment: enrichment ?? null };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @landmatch/server lint`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/repos/listingRepo.ts
git commit -m "feat(server): add upsertFromFeed, findPendingEnrichment, findListingWithEnrichment to listingRepo"
```

---

## Task 6: Search Profile Service

**Files:**
- Create: `apps/server/src/services/searchProfileService.ts`
- Test: `apps/server/src/__tests__/searchProfileService.test.ts`

- [ ] **Step 1: Write tests for searchProfileService**

Create `apps/server/src/__tests__/searchProfileService.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as searchProfileService from '../services/searchProfileService';

vi.mock('../repos/searchProfileRepo');

const mockRepo = vi.mocked(searchProfileRepo);

const PROFILE_ROW = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Hudson Valley Homestead',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 60,
  criteria: { price: { max: 400000 }, acreage: { min: 5 } },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

afterEach(() => vi.restoreAllMocks());

describe('searchProfileService', () => {
  describe('create', () => {
    it('inserts a profile and returns ok result', async () => {
      mockRepo.insert.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.create('user-1', {
        name: 'Hudson Valley Homestead',
        criteria: { price: { max: 400000 }, acreage: { min: 5 } },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe('profile-1');
        expect(result.data.name).toBe('Hudson Valley Homestead');
      }
      expect(mockRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', name: 'Hudson Valley Homestead' }),
        undefined,
      );
    });
  });

  describe('getById', () => {
    it('returns profile when owned by user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.getById('user-1', 'profile-1');

      expect(result.ok).toBe(true);
    });

    it('returns NOT_FOUND when profile does not exist', async () => {
      mockRepo.findById.mockResolvedValueOnce(undefined);

      const result = await searchProfileService.getById('user-1', 'nonexistent');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('NOT_FOUND');
    });

    it('returns FORBIDDEN when profile belongs to another user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.getById('other-user', 'profile-1');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('FORBIDDEN');
    });
  });

  describe('update', () => {
    it('updates and returns updated profile', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockRepo.update.mockResolvedValueOnce({ ...PROFILE_ROW, name: 'Updated' });

      const result = await searchProfileService.update('user-1', 'profile-1', { name: 'Updated' });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('deletes profile owned by user', async () => {
      mockRepo.findById.mockResolvedValueOnce(PROFILE_ROW);
      mockRepo.deleteById.mockResolvedValueOnce(PROFILE_ROW);

      const result = await searchProfileService.remove('user-1', 'profile-1');

      expect(result.ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/searchProfileService.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement searchProfileService**

Create `apps/server/src/services/searchProfileService.ts`:

```typescript
import { err, ok, type Result } from '@landmatch/api';
import type { CreateSearchProfile, UpdateSearchProfile, SearchProfileResponse } from '@landmatch/api';

import * as searchProfileRepo from '../repos/searchProfileRepo';

function toResponse(row: NonNullable<Awaited<ReturnType<typeof searchProfileRepo.findById>>>): SearchProfileResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isActive: row.isActive,
    alertFrequency: row.alertFrequency,
    alertThreshold: row.alertThreshold,
    criteria: row.criteria as SearchProfileResponse['criteria'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function create(userId: string, input: CreateSearchProfile): Promise<Result<SearchProfileResponse>> {
  try {
    const row = await searchProfileRepo.insert({
      userId,
      name: input.name,
      alertFrequency: input.alertFrequency ?? 'daily',
      alertThreshold: input.alertThreshold ?? 60,
      criteria: input.criteria as Record<string, unknown>,
      isActive: input.isActive ?? true,
    });
    return ok(toResponse(row));
  } catch (error) {
    console.error('[searchProfileService.create]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function getById(userId: string, id: string): Promise<Result<SearchProfileResponse>> {
  try {
    const row = await searchProfileRepo.findById(id);
    if (!row) return err('NOT_FOUND');
    if (row.userId !== userId) return err('FORBIDDEN');
    return ok(toResponse(row));
  } catch (error) {
    console.error('[searchProfileService.getById]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function listByUser(userId: string): Promise<Result<SearchProfileResponse[]>> {
  try {
    const rows = await searchProfileRepo.findByUserId(userId);
    return ok(rows.map(toResponse));
  } catch (error) {
    console.error('[searchProfileService.listByUser]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function update(
  userId: string,
  id: string,
  input: UpdateSearchProfile,
): Promise<Result<SearchProfileResponse>> {
  try {
    const existing = await searchProfileRepo.findById(id);
    if (!existing) return err('NOT_FOUND');
    if (existing.userId !== userId) return err('FORBIDDEN');

    const row = await searchProfileRepo.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.alertFrequency !== undefined && { alertFrequency: input.alertFrequency }),
      ...(input.alertThreshold !== undefined && { alertThreshold: input.alertThreshold }),
      ...(input.criteria !== undefined && { criteria: input.criteria as Record<string, unknown> }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    if (!row) return err('NOT_FOUND');
    return ok(toResponse(row));
  } catch (error) {
    console.error('[searchProfileService.update]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function remove(userId: string, id: string): Promise<Result<void>> {
  try {
    const existing = await searchProfileRepo.findById(id);
    if (!existing) return err('NOT_FOUND');
    if (existing.userId !== userId) return err('FORBIDDEN');

    await searchProfileRepo.deleteById(id);
    return ok(undefined);
  } catch (error) {
    console.error('[searchProfileService.remove]', error);
    return err('INTERNAL_ERROR');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/searchProfileService.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/searchProfileService.ts apps/server/src/__tests__/searchProfileService.test.ts
git commit -m "feat(server): add searchProfileService with ownership validation"
```

---

## Task 7: Search Profile Routes

**Files:**
- Create: `apps/server/src/routes/searchProfiles.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Create search profile routes**

Create `apps/server/src/routes/searchProfiles.ts`:

```typescript
import { Hono } from 'hono';
import { CreateSearchProfile, UpdateSearchProfile } from '@landmatch/api';

import { badRequest, forbidden, notFound, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as searchProfileService from '../services/searchProfileService';
import type { Env } from '../types/env';

const searchProfiles = new Hono<Env>();

// Dev auth: read userId from x-user-id header
function getUserId(c: { req: { header: (name: string) => string | undefined } }): string {
  const userId = c.req.header('x-user-id');
  if (!userId) {
    badRequest('x-user-id header is required');
  }
  return userId;
}

searchProfiles.post('/', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const parsed = CreateSearchProfile.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await searchProfileService.create(userId, parsed.data);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data, 201);
});

searchProfiles.get('/', async (c) => {
  const userId = getUserId(c);
  const result = await searchProfileService.listByUser(userId);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data);
});

searchProfiles.get('/:id', async (c) => {
  const userId = getUserId(c);
  const result = await searchProfileService.getById(userId, c.req.param('id'));

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

searchProfiles.put('/:id', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const parsed = UpdateSearchProfile.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await searchProfileService.update(userId, c.req.param('id'), parsed.data);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

searchProfiles.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const result = await searchProfileService.remove(userId, c.req.param('id'));

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, null, 200);
});

export default searchProfiles;
```

- [ ] **Step 2: Mount routes in app.ts**

In `apps/server/src/app.ts`, add the import:

```typescript
import searchProfilesRouter from './routes/searchProfiles';
```

Add the route mount after the existing listings route:

```typescript
app.route('/api/v1/search-profiles', searchProfilesRouter);
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @landmatch/server lint`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/searchProfiles.ts apps/server/src/app.ts
git commit -m "feat(server): add search profile CRUD routes at /api/v1/search-profiles"
```

---

## Task 8: `@landmatch/feeds` Package Scaffold

**Files:**
- Create: `packages/feeds/package.json`
- Create: `packages/feeds/tsconfig.json`
- Create: `packages/feeds/src/types.ts`
- Create: `packages/feeds/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/feeds/package.json`:

```json
{
  "name": "@landmatch/feeds",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@landmatch/api": "workspace:*",
    "rss-parser": "^3.13.0"
  },
  "scripts": {
    "lint": "tsc --noEmit && eslint src/",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "~5.9.3",
    "vitest": "^4.0.16"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/feeds/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/feeds/src/types.ts`:

```typescript
import type { Result } from '@landmatch/api';

export interface FeedAdapter {
  name: string;
  fetchListings(): Promise<Result<RawListing[]>>;
}

export interface RawListing {
  externalId: string;
  source: string;
  url: string;
  title: string;
  description?: string;
  price?: number;
  acreage?: number;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  rawData: Record<string, unknown>;
}

export interface FeedIngestionResult {
  listings: RawListing[];
  errors: { adapter: string; error: string }[];
}
```

- [ ] **Step 4: Create index.ts**

Create `packages/feeds/src/index.ts`:

```typescript
export type { FeedAdapter, FeedIngestionResult, RawListing } from './types';
export { runFeedIngestion } from './orchestrator';
export { createLandWatchAdapter } from './adapters/landwatch';
export { createLandComAdapter } from './adapters/land-com';
```

Note: This will have import errors until the orchestrator and adapters are created. That's fine — we'll build them in the next tasks.

- [ ] **Step 5: Install dependencies**

Run: `pnpm install`

Expected: `rss-parser` installed, workspace links created for `@landmatch/feeds`.

- [ ] **Step 6: Commit**

```bash
git add packages/feeds/
git commit -m "feat(feeds): scaffold @landmatch/feeds package with types"
```

---

## Task 9: Feed Orchestrator

**Files:**
- Create: `packages/feeds/src/orchestrator.ts`
- Test: `packages/feeds/src/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write orchestrator tests**

Create `packages/feeds/src/__tests__/orchestrator.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ok, err } from '@landmatch/api';

import { runFeedIngestion } from '../orchestrator';
import type { FeedAdapter, RawListing } from '../types';

function makeListing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    externalId: 'ext-1',
    source: 'test',
    url: 'https://example.com/listing/1',
    title: '10 Acres in Vermont',
    rawData: {},
    ...overrides,
  };
}

function makeAdapter(name: string, listings: RawListing[]): FeedAdapter {
  return { name, fetchListings: async () => ok(listings) };
}

function makeFailingAdapter(name: string, error: string): FeedAdapter {
  return { name, fetchListings: async () => err(error) };
}

describe('runFeedIngestion', () => {
  it('aggregates listings from multiple adapters', async () => {
    const adapter1 = makeAdapter('source-a', [makeListing({ externalId: '1', source: 'source-a' })]);
    const adapter2 = makeAdapter('source-b', [makeListing({ externalId: '2', source: 'source-b' })]);

    const result = await runFeedIngestion([adapter1, adapter2]);

    expect(result.listings).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('captures adapter errors without failing the whole run', async () => {
    const good = makeAdapter('good', [makeListing()]);
    const bad = makeFailingAdapter('bad', 'network timeout');

    const result = await runFeedIngestion([good, bad]);

    expect(result.listings).toHaveLength(1);
    expect(result.errors).toEqual([{ adapter: 'bad', error: 'network timeout' }]);
  });

  it('handles adapter throwing an exception', async () => {
    const throwing: FeedAdapter = {
      name: 'exploder',
      fetchListings: async () => { throw new Error('kaboom'); },
    };

    const result = await runFeedIngestion([throwing]);

    expect(result.listings).toHaveLength(0);
    expect(result.errors).toEqual([{ adapter: 'exploder', error: 'kaboom' }]);
  });

  it('returns empty result for no adapters', async () => {
    const result = await runFeedIngestion([]);

    expect(result.listings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/orchestrator.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement orchestrator**

Create `packages/feeds/src/orchestrator.ts`:

```typescript
import type { FeedAdapter, FeedIngestionResult, RawListing } from './types';

export async function runFeedIngestion(adapters: FeedAdapter[]): Promise<FeedIngestionResult> {
  const listings: RawListing[] = [];
  const errors: FeedIngestionResult['errors'] = [];

  const results = await Promise.allSettled(
    adapters.map(async (adapter) => {
      const result = await adapter.fetchListings();
      return { adapter: adapter.name, result };
    }),
  );

  for (const settled of results) {
    if (settled.status === 'rejected') {
      const error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      // Extract adapter name from the rejected promise — we need a different approach
      errors.push({ adapter: 'unknown', error });
      continue;
    }

    const { adapter, result } = settled.value;
    if (result.ok) {
      listings.push(...result.data);
    } else {
      errors.push({ adapter, error: result.error });
    }
  }

  return { listings, errors };
}
```

Wait — the `rejected` case loses the adapter name. Let's wrap each adapter call to always resolve:

```typescript
import type { FeedAdapter, FeedIngestionResult, RawListing } from './types';

export async function runFeedIngestion(adapters: FeedAdapter[]): Promise<FeedIngestionResult> {
  const listings: RawListing[] = [];
  const errors: FeedIngestionResult['errors'] = [];

  const results = await Promise.allSettled(
    adapters.map(async (adapter) => {
      try {
        const result = await adapter.fetchListings();
        return { adapter: adapter.name, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { adapter: adapter.name, result: { ok: false as const, error: message } };
      }
    }),
  );

  for (const settled of results) {
    // With the try/catch above, these should always be fulfilled
    if (settled.status === 'rejected') continue;

    const { adapter, result } = settled.value;
    if (result.ok) {
      listings.push(...result.data);
    } else {
      errors.push({ adapter, error: result.error });
    }
  }

  return { listings, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/orchestrator.test.ts`

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/feeds/src/orchestrator.ts packages/feeds/src/__tests__/orchestrator.test.ts
git commit -m "feat(feeds): add feed orchestrator with Promise.allSettled"
```

---

## Task 10: LandWatch Feed Adapter

**Files:**
- Create: `packages/feeds/src/adapters/landwatch.ts`
- Test: `packages/feeds/src/__tests__/landwatch.test.ts`

- [ ] **Step 1: Research LandWatch RSS feed structure**

Before writing tests, fetch a real LandWatch RSS feed to understand the XML structure. Check for RSS at URLs like `https://www.landwatch.com/rss/...` or similar. The adapter needs to know the actual field names in the RSS items.

Run this manually or via a quick script to inspect a sample feed entry and note the field names for: listing ID, title, description, price, acreage, location, URL.

- [ ] **Step 2: Write adapter tests**

Create `packages/feeds/src/__tests__/landwatch.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLandWatchAdapter } from '../adapters/landwatch';

// Sample RSS XML matching LandWatch's actual structure (update field names after Step 1)
const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>LandWatch Listings</title>
    <item>
      <title>10 Acres - Rural Farm Land</title>
      <link>https://www.landwatch.com/property/123456</link>
      <description>Beautiful 10 acre parcel in Greene County, NY. $150,000. Perfect for homesteading.</description>
      <guid>123456</guid>
    </item>
    <item>
      <title>25 Acres - Mountain Property</title>
      <link>https://www.landwatch.com/property/789012</link>
      <description>25 acres in Ulster County, NY. $275,000. Views of the Catskills.</description>
      <guid>789012</guid>
    </item>
  </channel>
</rss>`;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LandWatch adapter', () => {
  it('parses RSS feed into RawListing array', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      externalId: '123456',
      source: 'landwatch',
      title: '10 Acres - Rural Farm Land',
      url: 'https://www.landwatch.com/property/123456',
    });
  });

  it('extracts price from description when available', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].price).toBe(150000);
  });

  it('extracts acreage from title when available', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].acreage).toBe(10);
  });

  it('returns error when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network error'));

    const adapter = createLandWatchAdapter({ feedUrl: 'https://www.landwatch.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/landwatch.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement LandWatch adapter**

Create `packages/feeds/src/adapters/landwatch.ts`:

```typescript
import RssParser from 'rss-parser';
import { ok, err, type Result } from '@landmatch/api';

import type { FeedAdapter, RawListing } from '../types';

interface LandWatchAdapterConfig {
  feedUrl: string;
}

const parser = new RssParser();

function extractPrice(text: string): number | undefined {
  const match = text.match(/\$[\d,]+/);
  if (!match) return undefined;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || undefined;
}

function extractAcreage(text: string): number | undefined {
  const match = text.match(/([\d.]+)\s*acres?/i);
  if (!match) return undefined;
  return parseFloat(match[1]) || undefined;
}

function extractCountyState(text: string): { county?: string; state?: string } {
  // Pattern: "in County County, ST" or "County, ST"
  const match = text.match(/in\s+([A-Za-z\s]+?)\s+County,\s*([A-Z]{2})/i);
  if (!match) return {};
  return { county: `${match[1]} County`, state: match[2] };
}

export function createLandWatchAdapter(config: LandWatchAdapterConfig): FeedAdapter {
  return {
    name: 'landwatch',
    async fetchListings(): Promise<Result<RawListing[]>> {
      try {
        const response = await fetch(config.feedUrl);
        if (!response.ok) {
          return err(`LandWatch feed returned ${response.status}`);
        }

        const xml = await response.text();
        const feed = await parser.parseString(xml);

        const listings: RawListing[] = feed.items.map((item) => {
          const description = item.contentSnippet || item.content || item.description || '';
          const title = item.title || '';
          const combinedText = `${title} ${description}`;
          const { county, state } = extractCountyState(combinedText);

          return {
            externalId: item.guid || item.link || '',
            source: 'landwatch',
            url: item.link || '',
            title,
            description,
            price: extractPrice(combinedText),
            acreage: extractAcreage(combinedText),
            county,
            state,
            rawData: item as Record<string, unknown>,
          };
        });

        return ok(listings);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(`LandWatch fetch failed: ${message}`);
      }
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/landwatch.test.ts`

Expected: All tests pass. Adjust RSS XML structure and parsing logic if the real feed differs from the sample.

- [ ] **Step 6: Commit**

```bash
git add packages/feeds/src/adapters/landwatch.ts packages/feeds/src/__tests__/landwatch.test.ts
git commit -m "feat(feeds): add LandWatch RSS adapter"
```

---

## Task 11: Land.com Feed Adapter

**Files:**
- Create: `packages/feeds/src/adapters/land-com.ts`
- Test: `packages/feeds/src/__tests__/land-com.test.ts`

- [ ] **Step 1: Research Land.com feed structure**

Same as Task 10 Step 1 — check Land.com for RSS endpoints and inspect the XML structure. If Land.com doesn't have an accessible RSS feed, substitute LandAndFarm or Lands of America.

- [ ] **Step 2: Write adapter tests**

Create `packages/feeds/src/__tests__/land-com.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLandComAdapter } from '../adapters/land-com';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Land.com Listings</title>
    <item>
      <title>5 Acres in Sullivan County, NY - $95,000</title>
      <link>https://www.land.com/property/12345</link>
      <description>5 acre lot with road access and electric available.</description>
      <guid>land-12345</guid>
    </item>
  </channel>
</rss>`;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Land.com adapter', () => {
  it('parses RSS feed into RawListing array', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      externalId: 'land-12345',
      source: 'land.com',
      title: expect.stringContaining('5 Acres'),
      url: 'https://www.land.com/property/12345',
    });
  });

  it('extracts price from title', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data[0].price).toBe(95000);
  });

  it('returns error when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));

    const adapter = createLandComAdapter({ feedUrl: 'https://www.land.com/rss/test' });
    const result = await adapter.fetchListings();

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/land-com.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement Land.com adapter**

Create `packages/feeds/src/adapters/land-com.ts`:

```typescript
import RssParser from 'rss-parser';
import { ok, err, type Result } from '@landmatch/api';

import type { FeedAdapter, RawListing } from '../types';

interface LandComAdapterConfig {
  feedUrl: string;
}

const parser = new RssParser();

function extractPrice(text: string): number | undefined {
  const match = text.match(/\$[\d,]+/);
  if (!match) return undefined;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || undefined;
}

function extractAcreage(text: string): number | undefined {
  const match = text.match(/([\d.]+)\s*acres?/i);
  if (!match) return undefined;
  return parseFloat(match[1]) || undefined;
}

function extractCountyState(text: string): { county?: string; state?: string } {
  const match = text.match(/in\s+([A-Za-z\s]+?)\s+County,\s*([A-Z]{2})/i);
  if (!match) return {};
  return { county: `${match[1]} County`, state: match[2] };
}

export function createLandComAdapter(config: LandComAdapterConfig): FeedAdapter {
  return {
    name: 'land.com',
    async fetchListings(): Promise<Result<RawListing[]>> {
      try {
        const response = await fetch(config.feedUrl);
        if (!response.ok) {
          return err(`Land.com feed returned ${response.status}`);
        }

        const xml = await response.text();
        const feed = await parser.parseString(xml);

        const listings: RawListing[] = feed.items.map((item) => {
          const description = item.contentSnippet || item.content || item.description || '';
          const title = item.title || '';
          const combinedText = `${title} ${description}`;
          const { county, state } = extractCountyState(combinedText);

          return {
            externalId: item.guid || item.link || '',
            source: 'land.com',
            url: item.link || '',
            title,
            description,
            price: extractPrice(combinedText),
            acreage: extractAcreage(combinedText),
            county,
            state,
            rawData: item as Record<string, unknown>,
          };
        });

        return ok(listings);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(`Land.com fetch failed: ${message}`);
      }
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/feeds test:run -- src/__tests__/land-com.test.ts`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/feeds/src/adapters/land-com.ts packages/feeds/src/__tests__/land-com.test.ts
git commit -m "feat(feeds): add Land.com RSS adapter"
```

---

## Task 12: Matching Service

**Files:**
- Create: `apps/server/src/services/matchingService.ts`
- Test: `apps/server/src/__tests__/matchingService.test.ts`

- [ ] **Step 1: Write matching service tests**

Create `apps/server/src/__tests__/matchingService.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';
import { matchListingAgainstProfiles } from '../services/matchingService';

vi.mock('../repos/listingRepo');
vi.mock('../repos/searchProfileRepo');
vi.mock('../repos/scoreRepo');
vi.mock('../repos/alertRepo');

const mockListingRepo = vi.mocked(listingRepo);
const mockProfileRepo = vi.mocked(searchProfileRepo);
const mockScoreRepo = vi.mocked(scoreRepo);
const mockAlertRepo = vi.mocked(alertRepo);

const LISTING = {
  id: 'listing-1',
  externalId: 'ext-1',
  source: 'landwatch',
  url: 'https://example.com',
  title: '10 Acres',
  description: null,
  price: 200000,
  acreage: 10,
  address: '123 Main St',
  city: 'Hudson',
  county: 'Columbia',
  state: 'NY',
  zip: null,
  latitude: 42.25,
  longitude: -73.79,
  rawData: null,
  enrichmentStatus: 'complete',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
  delistedAt: null,
};

const ENRICHMENT = {
  id: 'enr-1',
  listingId: 'listing-1',
  soilCapabilityClass: 2,
  soilDrainageClass: 'well drained',
  soilTexture: 'loam',
  soilSuitabilityRatings: null,
  femaFloodZone: 'X',
  floodZoneDescription: 'Minimal flood hazard',
  zoningCode: null,
  zoningDescription: null,
  verifiedAcreage: null,
  parcelGeometry: null,
  fireRiskScore: null,
  floodRiskScore: null,
  heatRiskScore: null,
  droughtRiskScore: null,
  enrichedAt: new Date(),
  sourcesUsed: ['usda', 'fema'],
};

const PROFILE = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Hudson Valley',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 50,
  criteria: {
    price: { max: 300000 },
    acreage: { min: 5, max: 50 },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => vi.restoreAllMocks());

describe('matchListingAgainstProfiles', () => {
  it('scores listing against active profiles and creates alerts above threshold', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findByListingAndProfile.mockResolvedValueOnce(undefined);
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      scoredAt: new Date(),
    });
    mockAlertRepo.findByListingAndProfile.mockResolvedValueOnce(undefined);
    mockAlertRepo.insert.mockResolvedValueOnce({} as any);

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(1);
    expect(result.data.alertsCreated).toBe(1);
    expect(mockScoreRepo.insert).toHaveBeenCalledOnce();
    expect(mockAlertRepo.insert).toHaveBeenCalledOnce();
  });

  it('skips alert creation when score is below threshold', async () => {
    const lowThresholdProfile = { ...PROFILE, alertThreshold: 95 };
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: { ...LISTING, price: 500000 }, // very expensive → low score
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([lowThresholdProfile]);
    mockScoreRepo.findByListingAndProfile.mockResolvedValueOnce(undefined);
    mockScoreRepo.insert.mockResolvedValueOnce({
      id: 'score-1',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 40,
      componentScores: {},
      llmSummary: null,
      scoredAt: new Date(),
    });

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alertsCreated).toBe(0);
    expect(mockAlertRepo.insert).not.toHaveBeenCalled();
  });

  it('skips scoring when score already exists for listing+profile', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce({
      listing: LISTING,
      enrichment: ENRICHMENT,
    });
    mockProfileRepo.findActive.mockResolvedValueOnce([PROFILE]);
    mockScoreRepo.findByListingAndProfile.mockResolvedValueOnce({
      id: 'existing-score',
      listingId: 'listing-1',
      searchProfileId: 'profile-1',
      overallScore: 75,
      componentScores: {},
      llmSummary: null,
      scoredAt: new Date(),
    });

    const result = await matchListingAgainstProfiles('listing-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scored).toBe(0);
    expect(mockScoreRepo.insert).not.toHaveBeenCalled();
  });

  it('returns error when listing not found', async () => {
    mockListingRepo.findListingWithEnrichment.mockResolvedValueOnce(null);

    const result = await matchListingAgainstProfiles('nonexistent');

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/matchingService.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement matchingService**

Create `apps/server/src/services/matchingService.ts`:

```typescript
import { err, ok, type Result } from '@landmatch/api';
import { scoreListing } from '@landmatch/scoring';
import type { EnrichmentData, ListingData, SearchCriteria } from '@landmatch/scoring';

import * as listingRepo from '../repos/listingRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';
import * as scoreRepo from '../repos/scoreRepo';
import * as alertRepo from '../repos/alertRepo';

interface MatchResult {
  scored: number;
  alertsCreated: number;
}

function mapToListingData(listing: { price: number | null; acreage: number | null; latitude: number | null; longitude: number | null }): ListingData {
  return {
    price: listing.price ?? undefined,
    acreage: listing.acreage ?? undefined,
    latitude: listing.latitude ?? undefined,
    longitude: listing.longitude ?? undefined,
  };
}

function mapToEnrichmentData(enrichment: {
  soilCapabilityClass: number | null;
  femaFloodZone: string | null;
  zoningCode: string | null;
  fireRiskScore: number | null;
  floodRiskScore: number | null;
}): EnrichmentData {
  return {
    soilCapabilityClass: enrichment.soilCapabilityClass ?? undefined,
    floodZone: enrichment.femaFloodZone ?? undefined,
    zoningCode: enrichment.zoningCode ?? undefined,
    fireRiskScore: enrichment.fireRiskScore ?? undefined,
    floodRiskScore: enrichment.floodRiskScore ?? undefined,
  };
}

export async function matchListingAgainstProfiles(listingId: string): Promise<Result<MatchResult>> {
  try {
    const data = await listingRepo.findListingWithEnrichment(listingId);
    if (!data) return err('Listing not found');
    if (!data.enrichment) return err('Listing not enriched');

    const profiles = await searchProfileRepo.findActive();
    const listingData = mapToListingData(data.listing);
    const enrichmentData = mapToEnrichmentData(data.enrichment);

    let scored = 0;
    let alertsCreated = 0;

    for (const profile of profiles) {
      // Skip if already scored
      const existingScore = await scoreRepo.findByListingAndProfile(listingId, profile.id);
      if (existingScore) continue;

      const criteria = profile.criteria as SearchCriteria;
      const result = scoreListing(listingData, enrichmentData, criteria);

      const scoreRow = await scoreRepo.insert({
        listingId,
        searchProfileId: profile.id,
        overallScore: result.overallScore,
        componentScores: result.componentScores as Record<string, number>,
      });
      scored++;

      // Create alert if above threshold
      if (result.overallScore >= profile.alertThreshold) {
        const existingAlert = await alertRepo.findByListingAndProfile(listingId, profile.id);
        if (!existingAlert) {
          await alertRepo.insert({
            userId: profile.userId,
            searchProfileId: profile.id,
            listingId,
            scoreId: scoreRow.id,
            channel: 'email',
          });
          alertsCreated++;
        }
      }
    }

    return ok({ scored, alertsCreated });
  } catch (error) {
    console.error('[matchingService.matchListingAgainstProfiles]', error);
    return err('INTERNAL_ERROR');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/matchingService.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/matchingService.ts apps/server/src/__tests__/matchingService.test.ts
git commit -m "feat(server): add matchingService — scores listings against profiles, creates alerts"
```

---

## Task 13: Feed Pipeline Service

**Files:**
- Create: `apps/server/src/services/feedPipelineService.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/package.json`
- Test: `apps/server/src/__tests__/feedPipelineService.test.ts`

- [ ] **Step 1: Add `@landmatch/feeds` dependency and config**

In `apps/server/package.json`, add to `dependencies`:

```json
"@landmatch/feeds": "workspace:*"
```

In `apps/server/src/config.ts`, add after the `features` export:

```typescript
export const feedPipeline = {
  cronSchedule: optional('FEED_CRON_SCHEDULE', '*/30 * * * *'),
  enrichmentConcurrency: parseInt(optional('FEED_ENRICHMENT_CONCURRENCY', '5'), 10),
  enrichmentBatchSize: parseInt(optional('FEED_ENRICHMENT_BATCH_SIZE', '20'), 10),
  landwatchFeedUrl: optional('LANDWATCH_FEED_URL', ''),
  landComFeedUrl: optional('LAND_COM_FEED_URL', ''),
} as const;
```

- [ ] **Step 2: Write pipeline service tests**

Create `apps/server/src/__tests__/feedPipelineService.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as listingRepo from '../repos/listingRepo';
import * as matchingService from '../services/matchingService';
import { runPipeline } from '../services/feedPipelineService';
import { ok } from '@landmatch/api';
import type { FeedAdapter } from '@landmatch/feeds';

vi.mock('../repos/listingRepo');
vi.mock('../services/matchingService');
vi.mock('@landmatch/enrichment', () => ({
  enrichListing: vi.fn(),
}));

const mockListingRepo = vi.mocked(listingRepo);
const mockMatchingService = vi.mocked(matchingService);

afterEach(() => vi.restoreAllMocks());

describe('feedPipelineService.runPipeline', () => {
  it('ingests feed listings via upsertFromFeed', async () => {
    const adapter: FeedAdapter = {
      name: 'test',
      fetchListings: async () => ok([{
        externalId: 'ext-1',
        source: 'test',
        url: 'https://example.com/1',
        title: 'Test Listing',
        rawData: {},
      }]),
    };

    mockListingRepo.upsertFromFeed.mockResolvedValueOnce({
      id: 'listing-1',
      enrichmentStatus: 'pending',
    } as any);
    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([]);

    const result = await runPipeline([adapter]);

    expect(result.ingested).toBe(1);
    expect(mockListingRepo.upsertFromFeed).toHaveBeenCalledOnce();
  });

  it('enriches pending listings and runs matching on completed ones', async () => {
    const { enrichListing } = await import('@landmatch/enrichment');
    const mockEnrich = vi.mocked(enrichListing);

    mockListingRepo.findPendingEnrichment.mockResolvedValueOnce([
      { id: 'listing-1', address: '123 Main St', enrichmentStatus: 'pending' } as any,
    ]);
    mockEnrich.mockResolvedValueOnce(ok({
      geocode: { lat: 42.0, lng: -73.0, matchedAddress: '123 MAIN ST' },
      enrichment: { sourcesUsed: ['usda', 'fema'], errors: [] },
    }));
    mockListingRepo.insertEnrichment.mockResolvedValueOnce({} as any);
    mockListingRepo.updateEnrichmentStatus.mockResolvedValueOnce(undefined);
    mockMatchingService.matchListingAgainstProfiles.mockResolvedValueOnce(
      ok({ scored: 2, alertsCreated: 1 }),
    );

    const result = await runPipeline([], 10);

    expect(result.enriched).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.alertsCreated).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/feedPipelineService.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement feedPipelineService**

Create `apps/server/src/services/feedPipelineService.ts`:

```typescript
import { runFeedIngestion, type FeedAdapter } from '@landmatch/feeds';
import { enrichListing } from '@landmatch/enrichment';

import { feedPipeline } from '../config';
import * as listingRepo from '../repos/listingRepo';
import { matchListingAgainstProfiles } from './matchingService';

interface PipelineResult {
  ingested: number;
  enriched: number;
  enrichFailed: number;
  matched: number;
  alertsCreated: number;
  errors: string[];
}

export async function runPipeline(
  adapters: FeedAdapter[],
  enrichmentBatchSize: number = feedPipeline.enrichmentBatchSize,
): Promise<PipelineResult> {
  const result: PipelineResult = {
    ingested: 0,
    enriched: 0,
    enrichFailed: 0,
    matched: 0,
    alertsCreated: 0,
    errors: [],
  };

  // Stage 1: Ingest
  if (adapters.length > 0) {
    const feedResult = await runFeedIngestion(adapters);

    for (const error of feedResult.errors) {
      result.errors.push(`[${error.adapter}] ${error.error}`);
    }

    for (const listing of feedResult.listings) {
      try {
        await listingRepo.upsertFromFeed(listing);
        result.ingested++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`[upsert] ${listing.externalId}: ${msg}`);
      }
    }

    console.log(`[feedPipeline] Stage 1 complete: ${result.ingested} ingested`);
  }

  // Stage 2: Enrich
  const pendingListings = await listingRepo.findPendingEnrichment(enrichmentBatchSize);
  const enrichedListingIds: string[] = [];

  // Process with concurrency limit
  const concurrency = feedPipeline.enrichmentConcurrency;
  for (let i = 0; i < pendingListings.length; i += concurrency) {
    const batch = pendingListings.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (listing) => {
        if (!listing.address) {
          await listingRepo.updateEnrichmentStatus(listing.id, 'failed');
          result.enrichFailed++;
          result.errors.push(`[enrich] ${listing.id}: no address`);
          return;
        }

        const enrichResult = await enrichListing(listing.address);

        if (!enrichResult.ok) {
          await listingRepo.updateEnrichmentStatus(listing.id, 'failed');
          result.enrichFailed++;
          result.errors.push(`[enrich] ${listing.id}: ${enrichResult.error}`);
          return;
        }

        await listingRepo.insertEnrichment(listing.id, enrichResult.data.enrichment);
        await listingRepo.updateEnrichmentStatus(listing.id, 'complete');
        enrichedListingIds.push(listing.id);
        result.enriched++;
      }),
    );
  }

  console.log(`[feedPipeline] Stage 2 complete: ${result.enriched} enriched, ${result.enrichFailed} failed`);

  // Stage 3: Match
  for (const listingId of enrichedListingIds) {
    const matchResult = await matchListingAgainstProfiles(listingId);
    if (matchResult.ok) {
      result.matched += matchResult.data.scored;
      result.alertsCreated += matchResult.data.alertsCreated;
    } else {
      result.errors.push(`[match] ${listingId}: ${matchResult.error}`);
    }
  }

  console.log(
    `[feedPipeline] Stage 3 complete: ${result.matched} scored, ${result.alertsCreated} alerts created`,
  );

  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/server test:run -- src/__tests__/feedPipelineService.test.ts`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/feedPipelineService.ts apps/server/src/__tests__/feedPipelineService.test.ts apps/server/src/config.ts apps/server/package.json
git commit -m "feat(server): add feedPipelineService with ingest/enrich/match stages"
```

---

## Task 14: Cron Scheduler

**Files:**
- Create: `apps/server/src/jobs/scheduler.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Create scheduler**

Create `apps/server/src/jobs/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { createLandWatchAdapter, createLandComAdapter, type FeedAdapter } from '@landmatch/feeds';

import { feedPipeline } from '../config';
import { runPipeline } from '../services/feedPipelineService';

let jobRunning = false;

function buildAdapters(): FeedAdapter[] {
  const adapters: FeedAdapter[] = [];

  if (feedPipeline.landwatchFeedUrl) {
    adapters.push(createLandWatchAdapter({ feedUrl: feedPipeline.landwatchFeedUrl }));
  }
  if (feedPipeline.landComFeedUrl) {
    adapters.push(createLandComAdapter({ feedUrl: feedPipeline.landComFeedUrl }));
  }

  return adapters;
}

export function startScheduler(): void {
  const adapters = buildAdapters();

  if (adapters.length === 0) {
    console.log('[scheduler] No feed URLs configured — feed pipeline disabled');
    return;
  }

  console.log(
    `[scheduler] Starting feed pipeline cron: ${feedPipeline.cronSchedule} (${adapters.map((a) => a.name).join(', ')})`,
  );

  cron.schedule(feedPipeline.cronSchedule, async () => {
    if (jobRunning) {
      console.log('[scheduler] Skipping — previous run still in progress');
      return;
    }

    jobRunning = true;
    const startTime = Date.now();

    try {
      console.log('[scheduler] Feed pipeline run starting');
      const result = await runPipeline(adapters);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(
        `[scheduler] Feed pipeline complete in ${elapsed}s: ` +
        `ingested=${result.ingested} enriched=${result.enriched} ` +
        `matched=${result.matched} alerts=${result.alertsCreated} ` +
        `errors=${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn('[scheduler] Errors:', result.errors.slice(0, 10));
      }
    } catch (error) {
      console.error('[scheduler] Feed pipeline failed:', error);
    } finally {
      jobRunning = false;
    }
  });
}
```

- [ ] **Step 2: Start scheduler in server index.ts**

In `apps/server/src/index.ts`, add the import:

```typescript
import { startScheduler } from './jobs/scheduler';
```

Then add `startScheduler()` after the server starts, inside `startServer()`:

```typescript
serve({ fetch: app.fetch, port: server.port });
console.log(`[${getTimestamp()}] [INFO] Hono server running on port ${server.port}`);
startScheduler();
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @landmatch/server lint`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/jobs/scheduler.ts apps/server/src/index.ts
git commit -m "feat(server): add cron scheduler for feed pipeline"
```

---

## Task 15: Full Verification

**Files:** None (verification only)

- [ ] **Step 1: Install all dependencies**

Run: `pnpm install`

Expected: Clean install, workspace links resolved.

- [ ] **Step 2: Run all tests**

Run: `pnpm --filter @landmatch/feeds test:run && pnpm --filter @landmatch/scoring test:run && pnpm --filter @landmatch/server test:run`

Expected: All tests pass across feeds, scoring, and server packages.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: No lint errors.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: Clean build.

- [ ] **Step 5: Verify server starts**

Run: `pnpm dev:server` (then Ctrl-C after startup)

Expected: Server starts, migrations run, scheduler reports status (either "feed pipeline disabled" if no URLs configured, or "Starting feed pipeline cron" if URLs set).

- [ ] **Step 6: Close beads**

Close each bead with its relevant commit hash:

```bash
bd close land-match-6a4.1 -m "<hash>. Added SearchCriteria Zod schema, search profile CRUD (routes, service, repo)"
bd close land-match-6a4.2 -m "<hash>. Implemented RSS feed ingestion with LandWatch and Land.com adapters"
bd close land-match-6a4.3 -m "<hash>. Added cron scheduler with feed pipeline (ingest, enrich, match stages)"
bd close land-match-6a4.4 -m "<hash>. Implemented criteria matching via matchingService with alert creation"
```
