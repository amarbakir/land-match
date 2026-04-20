# Phase 5: Dashboard & Browse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3-panel dashboard app shell with match inbox, sidebar nav, filtering, and shortlist/dismiss/read tracking — wired to real API data.

**Architecture:** Backend-first: DB migration → Zod schemas → repo → service → routes. Then frontend: API client → hooks → components → layout → routing. Each task is independently committable.

**Tech Stack:** Drizzle ORM, Zod, Hono, React Native Web, Tamagui, React Query, Expo Router

---

## File Map

### Backend — New/Modified

| File | Action | Purpose |
|------|--------|---------|
| `packages/db/src/schema.ts` | Modify | Add `status` + `readAt` to scores table |
| `packages/api/src/matches.ts` | Create | MatchItem, MatchFilters, PaginatedMatches, UpdateMatchStatus, ProfileCounts schemas |
| `packages/api/src/index.ts` | Modify | Re-export new match schemas |
| `apps/server/src/repos/scoreRepo.ts` | Modify | Add `findMatchesByProfile`, `updateStatus`, `getProfileCounts` |
| `apps/server/src/services/matchService.ts` | Create | getMatches, updateStatus, getProfileCounts — with ownership validation |
| `apps/server/src/routes/matches.ts` | Create | GET /:id/matches, PATCH /scores/:id, GET /counts |
| `apps/server/src/routes/scores.ts` | Create | PATCH /scores/:id |
| `apps/server/src/app.ts` | Modify | Mount match routes + score routes |

### Frontend — New/Modified

| File | Action | Purpose |
|------|--------|---------|
| `apps/frontend/src/api/client.ts` | Modify | Add `apiPatch` method |
| `apps/frontend/src/api/hooks.ts` | Modify | Add useSearchProfiles, useProfileMatches, useProfileCounts, useUpdateMatchStatus |
| `apps/frontend/src/theme/colors.ts` | Modify | Add missing color tokens (bgDeep, cardAlt, borderSoft, textFaint) |
| `apps/frontend/src/ui/dashboard/Icon.tsx` | Create | SVG icon components from design prototype |
| `apps/frontend/src/ui/dashboard/ScoreRing.tsx` | Create | SVG circular progress with color tiers |
| `apps/frontend/src/ui/dashboard/Tag.tsx` | Create | Monospace badge with tone variants |
| `apps/frontend/src/ui/dashboard/FilterChips.tsx` | Create | Toggle filter bar with counts |
| `apps/frontend/src/ui/dashboard/MatchRow.tsx` | Create | Match list item with score ring, meta, tags |
| `apps/frontend/src/ui/dashboard/MatchListPane.tsx` | Create | Profile picker + filters + scrollable match list |
| `apps/frontend/src/ui/dashboard/SidebarNav.tsx` | Create | Workspace views + profile list + user footer |
| `apps/frontend/src/ui/dashboard/Topbar.tsx` | Create | Breadcrumbs + coord chip + icon buttons |
| `apps/frontend/src/ui/dashboard/AppShell.tsx` | Create | 3-panel responsive layout container |
| `apps/frontend/src/ui/dashboard/EmptyState.tsx` | Create | Topographic SVG + title + subtitle |
| `apps/frontend/src/ui/dashboard/ShortlistView.tsx` | Create | Card grid for shortlisted/dismissed matches |
| `apps/frontend/app/(app)/_layout.tsx` | Modify | Replace Stack with AppShell |
| `apps/frontend/app/(app)/index.tsx` | Create | Inbox view (replaces search/index.tsx) |
| `apps/frontend/app/(app)/shortlist.tsx` | Create | Shortlist card grid view |
| `apps/frontend/app/(app)/dismissed.tsx` | Create | Dismissed card grid view |

---

## Task 1: DB Migration — Add status and readAt to scores

**Files:**
- Modify: `packages/db/src/schema.ts:79-87`
- Generate: `packages/db/drizzle/0002_*.sql` (auto-generated)

- [ ] **Step 1: Add columns to schema**

In `packages/db/src/schema.ts`, update the scores table:

```typescript
export const scores = pgTable('scores', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull().references(() => listings.id),
  searchProfileId: text('search_profile_id').notNull().references(() => searchProfiles.id),
  overallScore: integer('overall_score').notNull(),
  componentScores: jsonb('component_scores').notNull(),
  llmSummary: text('llm_summary'),
  status: text('status').notNull().default('inbox'),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  scoredAt: timestamp('scored_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @landmatch/db db:generate`
Expected: New migration SQL file created in `packages/db/drizzle/`

- [ ] **Step 3: Verify migration SQL**

Read the generated migration file. It should contain:
```sql
ALTER TABLE "scores" ADD COLUMN "status" text DEFAULT 'inbox' NOT NULL;
ALTER TABLE "scores" ADD COLUMN "read_at" timestamp with time zone;
```

- [ ] **Step 4: Run migration**

Run: `pnpm --filter @landmatch/db db:migrate`
Expected: Migration applied successfully

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: add status and read_at columns to scores table"
```

---

## Task 2: Match Zod Schemas

**Files:**
- Create: `packages/api/src/matches.ts`
- Modify: `packages/api/src/index.ts:1-20`

- [ ] **Step 1: Create match schemas**

Create `packages/api/src/matches.ts`:

```typescript
import { z } from 'zod';

export const MatchStatus = z.enum(['inbox', 'shortlisted', 'dismissed']);
export type MatchStatus = z.infer<typeof MatchStatus>;

export const ComponentScores = z.object({
  soil: z.number(),
  flood: z.number(),
  price: z.number(),
  acreage: z.number(),
  zoning: z.number(),
  geography: z.number(),
  infrastructure: z.number(),
  climate: z.number(),
});

export const MatchItem = z.object({
  scoreId: z.string(),
  listingId: z.string(),
  overallScore: z.number(),
  componentScores: ComponentScores,
  llmSummary: z.string().nullable(),
  status: MatchStatus,
  readAt: z.string().nullable(),
  scoredAt: z.string(),

  title: z.string().nullable(),
  address: z.string(),
  price: z.number().nullable(),
  acreage: z.number().nullable(),
  source: z.string().nullable(),
  url: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),

  soilClass: z.number().nullable(),
  soilClassLabel: z.string().nullable(),
  primeFarmland: z.boolean().nullable(),
  floodZone: z.string().nullable(),
  zoning: z.string().nullable(),
});
export type MatchItem = z.infer<typeof MatchItem>;

export const MatchFilters = z.object({
  status: MatchStatus.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(['score', 'date', 'price', 'acreage']).optional().default('score'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type MatchFilters = z.infer<typeof MatchFilters>;

export const PaginatedMatches = z.object({
  items: z.array(MatchItem),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type PaginatedMatches = z.infer<typeof PaginatedMatches>;

export const UpdateMatchStatus = z.object({
  status: MatchStatus.optional(),
  markAsRead: z.boolean().optional(),
});
export type UpdateMatchStatus = z.infer<typeof UpdateMatchStatus>;

export const ProfileCountItem = z.object({
  profileId: z.string(),
  total: z.number(),
  unread: z.number(),
  shortlisted: z.number(),
});

export const ProfileCounts = z.array(ProfileCountItem);
export type ProfileCounts = z.infer<typeof ProfileCounts>;
```

- [ ] **Step 2: Export from index**

In `packages/api/src/index.ts`, add:

```typescript
export {
  MatchItem,
  MatchFilters,
  MatchStatus,
  PaginatedMatches,
  UpdateMatchStatus,
  ProfileCounts,
  ComponentScores,
} from './matches';
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @landmatch/api build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/matches.ts packages/api/src/index.ts
git commit -m "feat: add match, filter, and profile count Zod schemas"
```

---

## Task 3: Score Repo — Match Queries

**Files:**
- Modify: `apps/server/src/repos/scoreRepo.ts`

- [ ] **Step 1: Add findMatchesByProfile query**

Add to `apps/server/src/repos/scoreRepo.ts`:

```typescript
import { eq, and, desc, asc, inArray, sql, isNull, count as countFn, gte } from 'drizzle-orm';
import { scores, listings, enrichments, searchProfiles } from '@landmatch/db';

// ... existing imports and functions ...

export interface MatchQueryOptions {
  status?: string;
  minScore?: number;
  sort?: 'score' | 'date' | 'price' | 'acreage';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function findMatchesByProfile(profileId: string, opts: MatchQueryOptions = {}, tx?: Tx) {
  const { status, minScore = 0, sort = 'score', sortDir = 'desc', limit = 20, offset = 0 } = opts;
  const conn = tx ?? db;

  const conditions = [
    eq(scores.searchProfileId, profileId),
    gte(scores.overallScore, minScore),
  ];
  if (status) {
    conditions.push(eq(scores.status, status));
  }

  const orderMap = {
    score: scores.overallScore,
    date: scores.scoredAt,
    price: listings.price,
    acreage: listings.acreage,
  };
  const orderCol = orderMap[sort] ?? scores.overallScore;
  const orderDir = sortDir === 'asc' ? asc(orderCol) : desc(orderCol);

  const [rows, totalResult] = await Promise.all([
    conn
      .select({
        scoreId: scores.id,
        listingId: scores.listingId,
        overallScore: scores.overallScore,
        componentScores: scores.componentScores,
        llmSummary: scores.llmSummary,
        status: scores.status,
        readAt: scores.readAt,
        scoredAt: scores.scoredAt,
        title: listings.title,
        address: listings.address,
        price: listings.price,
        acreage: listings.acreage,
        source: listings.source,
        url: listings.url,
        lat: listings.latitude,
        lng: listings.longitude,
        soilClass: enrichments.soilCapabilityClass,
        floodZone: enrichments.femaFloodZone,
        zoning: enrichments.zoningCode,
      })
      .from(scores)
      .innerJoin(listings, eq(scores.listingId, listings.id))
      .leftJoin(enrichments, eq(listings.id, enrichments.listingId))
      .where(and(...conditions))
      .orderBy(orderDir)
      .limit(limit)
      .offset(offset),
    conn
      .select({ count: countFn() })
      .from(scores)
      .innerJoin(listings, eq(scores.listingId, listings.id))
      .where(and(...conditions)),
  ]);

  return { rows, total: Number(totalResult[0]?.count ?? 0) };
}
```

- [ ] **Step 2: Add updateStatus function**

Add to `apps/server/src/repos/scoreRepo.ts`:

```typescript
export async function updateStatus(id: string, data: { status?: string; readAt?: Date }, tx?: Tx) {
  const updates: Record<string, unknown> = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.readAt !== undefined) updates.readAt = data.readAt;

  if (Object.keys(updates).length === 0) return null;

  const [row] = await (tx ?? db)
    .update(scores)
    .set(updates)
    .where(eq(scores.id, id))
    .returning();

  return row ?? null;
}
```

- [ ] **Step 3: Add getProfileCounts function**

Add to `apps/server/src/repos/scoreRepo.ts`:

```typescript
export async function getProfileCounts(profileIds: string[], tx?: Tx) {
  if (profileIds.length === 0) return [];

  const conn = tx ?? db;

  const rows = await conn
    .select({
      profileId: scores.searchProfileId,
      total: countFn(),
      unread: sql<number>`count(*) filter (where ${scores.readAt} is null and ${scores.status} = 'inbox')`,
      shortlisted: sql<number>`count(*) filter (where ${scores.status} = 'shortlisted')`,
    })
    .from(scores)
    .where(inArray(scores.searchProfileId, profileIds))
    .groupBy(scores.searchProfileId);

  return rows.map(r => ({
    profileId: r.profileId,
    total: Number(r.total),
    unread: Number(r.unread),
    shortlisted: Number(r.shortlisted),
  }));
}
```

- [ ] **Step 4: Add findById helper**

Add to `apps/server/src/repos/scoreRepo.ts`:

```typescript
export async function findById(id: string, tx?: Tx) {
  return (tx ?? db).query.scores.findFirst({
    where: eq(scores.id, id),
  });
}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm --filter @landmatch/server build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/repos/scoreRepo.ts
git commit -m "feat: add match query, status update, and profile count repo methods"
```

---

## Task 4: Match Service

**Files:**
- Create: `apps/server/src/services/matchService.ts`

- [ ] **Step 1: Create match service**

Create `apps/server/src/services/matchService.ts`:

```typescript
import { err, ok, type Result } from '@landmatch/api';
import type { MatchItem, PaginatedMatches, MatchFilters, ProfileCounts, UpdateMatchStatus } from '@landmatch/api';

import * as scoreRepo from '../repos/scoreRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';

const SOIL_CLASS_LABELS: Record<number, string> = {
  1: 'Class I', 2: 'Class II', 3: 'Class III', 4: 'Class IV',
  5: 'Class V', 6: 'Class VI', 7: 'Class VII', 8: 'Class VIII',
};

function toMatchItem(row: Record<string, unknown>): MatchItem {
  const soilClass = row.soilClass as number | null;
  return {
    scoreId: row.scoreId as string,
    listingId: row.listingId as string,
    overallScore: row.overallScore as number,
    componentScores: row.componentScores as MatchItem['componentScores'],
    llmSummary: (row.llmSummary as string) ?? null,
    status: row.status as MatchItem['status'],
    readAt: row.readAt ? (row.readAt as Date).toISOString() : null,
    scoredAt: (row.scoredAt as Date).toISOString(),
    title: (row.title as string) ?? null,
    address: row.address as string,
    price: (row.price as number) ?? null,
    acreage: (row.acreage as number) ?? null,
    source: (row.source as string) ?? null,
    url: (row.url as string) ?? null,
    lat: (row.lat as number) ?? null,
    lng: (row.lng as number) ?? null,
    soilClass,
    soilClassLabel: soilClass ? (SOIL_CLASS_LABELS[soilClass] ?? null) : null,
    primeFarmland: soilClass ? soilClass <= 2 : null,
    floodZone: (row.floodZone as string) ?? null,
    zoning: (row.zoning as string) ?? null,
  };
}

export async function getMatches(
  userId: string,
  profileId: string,
  filters: MatchFilters,
): Promise<Result<PaginatedMatches>> {
  try {
    const profile = await searchProfileRepo.findById(profileId);
    if (!profile) return err('NOT_FOUND');
    if (profile.userId !== userId) return err('FORBIDDEN');

    const { rows, total } = await scoreRepo.findMatchesByProfile(profileId, {
      status: filters.status,
      minScore: filters.minScore,
      sort: filters.sort,
      sortDir: filters.sortDir,
      limit: filters.limit,
      offset: filters.offset,
    });

    return ok({
      items: rows.map(toMatchItem),
      total,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    });
  } catch (error) {
    console.error('[matchService.getMatches]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function updateMatchStatus(
  userId: string,
  scoreId: string,
  input: UpdateMatchStatus,
): Promise<Result<{ scoreId: string; status: string; readAt: string | null }>> {
  try {
    const score = await scoreRepo.findById(scoreId);
    if (!score) return err('NOT_FOUND');

    const profile = await searchProfileRepo.findById(score.searchProfileId);
    if (!profile) return err('NOT_FOUND');
    if (profile.userId !== userId) return err('FORBIDDEN');

    const updates: { status?: string; readAt?: Date } = {};
    if (input.status) updates.status = input.status;
    if (input.markAsRead && !score.readAt) updates.readAt = new Date();

    const updated = await scoreRepo.updateStatus(scoreId, updates);
    if (!updated) return err('NOT_FOUND');

    return ok({
      scoreId: updated.id,
      status: updated.status,
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
    });
  } catch (error) {
    console.error('[matchService.updateMatchStatus]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function getProfileCounts(userId: string): Promise<Result<ProfileCounts>> {
  try {
    const profiles = await searchProfileRepo.findByUserId(userId);
    const profileIds = profiles.map(p => p.id);
    const counts = await scoreRepo.getProfileCounts(profileIds);

    // Include profiles with zero matches
    const countsMap = new Map(counts.map(c => [c.profileId, c]));
    const result = profileIds.map(id => countsMap.get(id) ?? {
      profileId: id,
      total: 0,
      unread: 0,
      shortlisted: 0,
    });

    return ok(result);
  } catch (error) {
    console.error('[matchService.getProfileCounts]', error);
    return err('INTERNAL_ERROR');
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @landmatch/server build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/matchService.ts
git commit -m "feat: add match service with getMatches, updateStatus, getProfileCounts"
```

---

## Task 5: Match & Score Routes

**Files:**
- Create: `apps/server/src/routes/matches.ts`
- Create: `apps/server/src/routes/scores.ts`
- Modify: `apps/server/src/app.ts:1-63`

- [ ] **Step 1: Create matches route**

Create `apps/server/src/routes/matches.ts`. This will be mounted under `/api/v1/search-profiles`:

```typescript
import { Hono } from 'hono';
import { MatchFilters } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as matchService from '../services/matchService';
import type { Env } from '../types/env';

const matches = new Hono<Env>();

// GET /search-profiles/:id/matches
matches.get('/:id/matches', async (c) => {
  const userId = c.get('userId');
  const profileId = c.req.param('id');

  const parsed = MatchFilters.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await matchService.getMatches(userId, profileId, parsed.data);
  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

// GET /search-profiles/counts
matches.get('/counts', async (c) => {
  const userId = c.get('userId');
  const result = await matchService.getProfileCounts(userId);

  if (!result.ok) {
    return throwFromResult(result);
  }

  return okResponse(c, result.data);
});

export default matches;
```

- [ ] **Step 2: Create scores route**

Create `apps/server/src/routes/scores.ts`:

```typescript
import { Hono } from 'hono';
import { UpdateMatchStatus } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as matchService from '../services/matchService';
import type { Env } from '../types/env';

const scoresRouter = new Hono<Env>();

// PATCH /scores/:id
scoresRouter.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const scoreId = c.req.param('id');
  const body = await c.req.json();

  const parsed = UpdateMatchStatus.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await matchService.updateMatchStatus(userId, scoreId, parsed.data);
  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404, FORBIDDEN: 403 });
  }

  return okResponse(c, result.data);
});

export default scoresRouter;
```

- [ ] **Step 3: Mount routes in app.ts**

In `apps/server/src/app.ts`, add imports and mount:

```typescript
import matchesRouter from './routes/matches';
import scoresRouter from './routes/scores';
```

After the existing search-profiles route mount, add:

```typescript
  app.route('/api/v1/search-profiles', matchesRouter);
  app.use('/api/v1/scores/*', requireAuth);
  app.route('/api/v1/scores', scoresRouter);
```

Note: The matches router is mounted at the same prefix as searchProfiles because its routes use `/search-profiles/:id/matches` and `/search-profiles/counts`. Hono merges routes from multiple routers on the same prefix.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm --filter @landmatch/server build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/matches.ts apps/server/src/routes/scores.ts apps/server/src/app.ts
git commit -m "feat: add match listing, score update, and profile count endpoints"
```

---

## Task 6: Frontend API Client — Add apiPatch

**Files:**
- Modify: `apps/frontend/src/api/client.ts:79-119`

- [ ] **Step 1: Add apiPatch method**

Add after the `apiGet` function in `apps/frontend/src/api/client.ts`:

```typescript
export async function apiPatch<TReq, TRes>(
  path: string,
  body: TReq,
  options?: RequestOptions,
): Promise<TRes> {
  const init: RequestInit = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, init)
    : await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/api/client.ts
git commit -m "feat: add apiPatch method to API client"
```

---

## Task 7: Frontend React Query Hooks

**Files:**
- Modify: `apps/frontend/src/api/hooks.ts`

- [ ] **Step 1: Add all dashboard hooks**

Replace the contents of `apps/frontend/src/api/hooks.ts`:

```typescript
import type {
  EnrichListingRequest,
  EnrichListingResponse,
  MatchItem,
  PaginatedMatches,
  ProfileCounts,
  SearchProfileResponse,
  UpdateMatchStatus,
} from '@landmatch/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPatch, apiPost } from './client';

export function useEnrichListing() {
  return useMutation<EnrichListingResponse, Error, EnrichListingRequest>({
    mutationFn: (body) =>
      apiPost<EnrichListingRequest, EnrichListingResponse>(
        '/api/v1/listings/enrich',
        body,
      ),
  });
}

export function useSearchProfiles() {
  return useQuery<SearchProfileResponse[], Error>({
    queryKey: ['searchProfiles'],
    queryFn: () => apiGet<SearchProfileResponse[]>('/api/v1/search-profiles'),
  });
}

export function useProfileCounts() {
  return useQuery<ProfileCounts, Error>({
    queryKey: ['profileCounts'],
    queryFn: () => apiGet<ProfileCounts>('/api/v1/search-profiles/counts'),
    refetchInterval: 60_000,
  });
}

interface MatchQueryParams {
  status?: string;
  minScore?: number;
  sort?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export function useProfileMatches(profileId: string | null, params: MatchQueryParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.minScore !== undefined) searchParams.set('minScore', String(params.minScore));
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.sortDir) searchParams.set('sortDir', params.sortDir);
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const path = `/api/v1/search-profiles/${profileId}/matches${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedMatches, Error>({
    queryKey: ['profileMatches', profileId, params],
    queryFn: () => apiGet<PaginatedMatches>(path),
    enabled: !!profileId,
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { scoreId: string; status: string; readAt: string | null },
    Error,
    { scoreId: string; data: UpdateMatchStatus }
  >({
    mutationFn: ({ scoreId, data }) =>
      apiPatch<UpdateMatchStatus, { scoreId: string; status: string; readAt: string | null }>(
        `/api/v1/scores/${scoreId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profileMatches'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @landmatch/frontend build` (or check with tsc)
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/hooks.ts
git commit -m "feat: add React Query hooks for profiles, matches, counts, and status updates"
```

---

## Task 8: Color Tokens Update

**Files:**
- Modify: `apps/frontend/src/theme/colors.ts`

- [ ] **Step 1: Add missing design tokens**

Update `apps/frontend/src/theme/colors.ts`:

```typescript
export const colors = {
  background: '#0F1410',
  backgroundDeep: '#0A0E0B',
  cardBackground: '#1A2118',
  cardAlt: '#222B20',
  border: '#2C3E2D',
  borderSoft: '#223022',
  textPrimary: '#E8DDD3',
  textSecondary: '#9BA393',
  textFaint: '#6B7363',
  accent: '#D4A843',
  accentHover: '#E0BA5A',
  accentPress: '#B8922F',
  accentSecondary: '#C4956A',
  success: '#7DB88A',
  danger: '#DC2626',
  warning: '#E5A15A',
} as const;

export type Colors = typeof colors;
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/theme/colors.ts
git commit -m "feat: add missing color tokens for dashboard design"
```

---

## Task 9: Icon Components

**Files:**
- Create: `apps/frontend/src/ui/dashboard/Icon.tsx`

- [ ] **Step 1: Create icon component file**

Create `apps/frontend/src/ui/dashboard/Icon.tsx`:

```tsx
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const defaultProps = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

export function InboxIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  );
}

export function StarIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

export function ArchiveIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Polyline points="21 8 21 21 3 21 3 8" />
      <Rect x={1} y={3} width={22} height={5} />
      <Line x1={10} y1={12} x2={14} y2={12} />
    </Svg>
  );
}

export function SlidersIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Line x1={4} y1={21} x2={4} y2={14} />
      <Line x1={4} y1={10} x2={4} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={12} />
      <Line x1={12} y1={8} x2={12} y2={3} />
      <Line x1={20} y1={21} x2={20} y2={16} />
      <Line x1={20} y1={12} x2={20} y2={3} />
      <Line x1={1} y1={14} x2={7} y2={14} />
      <Line x1={9} y1={8} x2={15} y2={8} />
      <Line x1={17} y1={16} x2={23} y2={16} />
    </Svg>
  );
}

export function BellIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function SettingsIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

export function SearchIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

export function DismissIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

export function ExternalIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <Polyline points="15 3 21 3 21 9" />
      <Line x1={10} y1={14} x2={21} y2={3} />
    </Svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/Icon.tsx
git commit -m "feat: add SVG icon components matching design prototype"
```

---

## Task 10: ScoreRing Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/ScoreRing.tsx`

- [ ] **Step 1: Create ScoreRing**

Create `apps/frontend/src/ui/dashboard/ScoreRing.tsx`:

```tsx
import { View } from 'react-native';

import Svg, { Circle } from 'react-native-svg';
import { Text } from 'tamagui';

import { colors } from '@/src/theme/colors';

function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.accentSecondary;
  if (score >= 40) return colors.accent;
  return colors.danger;
}

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 40 }: ScoreRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;
  const color = scoreColor(score);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.borderSoft}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text fontSize={size * 0.3} fontWeight="700" color={color}>
          {score}
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/ScoreRing.tsx
git commit -m "feat: add ScoreRing SVG component with color tiers"
```

---

## Task 11: Tag and FilterChips Components

**Files:**
- Create: `apps/frontend/src/ui/dashboard/Tag.tsx`
- Create: `apps/frontend/src/ui/dashboard/FilterChips.tsx`

- [ ] **Step 1: Create Tag component**

Create `apps/frontend/src/ui/dashboard/Tag.tsx`:

```tsx
import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

type TagTone = 'default' | 'green' | 'gold' | 'clay';

const toneColors: Record<TagTone, string> = {
  default: colors.textSecondary,
  green: colors.success,
  gold: colors.accent,
  clay: colors.accentSecondary,
};

interface TagProps {
  label: string;
  tone?: TagTone;
}

export function Tag({ label, tone = 'default' }: TagProps) {
  return (
    <XStack
      backgroundColor={colors.cardAlt}
      paddingHorizontal={6}
      paddingVertical={1}
      borderRadius={3}
    >
      <Text
        fontFamily="$mono"
        fontSize={9}
        textTransform="uppercase"
        letterSpacing={0.4}
        color={toneColors[tone]}
      >
        {label}
      </Text>
    </XStack>
  );
}
```

- [ ] **Step 2: Create FilterChips component**

Create `apps/frontend/src/ui/dashboard/FilterChips.tsx`:

```tsx
import { Pressable, StyleSheet } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

export type FilterKey = 'all' | 'unread' | 'strong' | 'shortlist';

interface FilterChipsProps {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onSelect: (key: FilterKey) => void;
}

const CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'strong', label: '≥80' },
  { key: 'shortlist', label: '★' },
];

export function FilterChips({ active, counts, onSelect }: FilterChipsProps) {
  return (
    <XStack gap={5} paddingHorizontal={16} paddingVertical={8} borderBottomWidth={1} borderColor={colors.borderSoft}>
      {CHIPS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <Pressable key={key} onPress={() => onSelect(key)}>
            <XStack
              backgroundColor={isActive ? colors.accent : 'transparent'}
              borderWidth={1}
              borderColor={isActive ? colors.accent : colors.border}
              paddingHorizontal={10}
              paddingVertical={3}
              borderRadius={10}
              gap={4}
              alignItems="center"
            >
              <Text
                fontFamily="$mono"
                fontSize={10}
                fontWeight={isActive ? '600' : '400'}
                color={isActive ? colors.background : colors.textSecondary}
              >
                {label}
              </Text>
              <Text
                fontFamily="$mono"
                fontSize={9}
                color={isActive ? colors.background : colors.textFaint}
                opacity={0.7}
              >
                {counts[key]}
              </Text>
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/ui/dashboard/Tag.tsx apps/frontend/src/ui/dashboard/FilterChips.tsx
git commit -m "feat: add Tag and FilterChips components"
```

---

## Task 12: MatchRow Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/MatchRow.tsx`

- [ ] **Step 1: Create MatchRow**

Create `apps/frontend/src/ui/dashboard/MatchRow.tsx`:

```tsx
import { Pressable, View } from 'react-native';

import type { MatchItem } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { ScoreRing } from './ScoreRing';
import { Tag } from './Tag';

interface MatchRowProps {
  match: MatchItem;
  selected: boolean;
  shortlisted: boolean;
  onPress: () => void;
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1000).toFixed(0)}K`;
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function deriveTags(match: MatchItem): { label: string; tone: 'green' | 'gold' | 'clay' | 'default' }[] {
  const tags: { label: string; tone: 'green' | 'gold' | 'clay' | 'default' }[] = [];
  if (match.floodZone === 'X') tags.push({ label: 'Zone X', tone: 'green' });
  else if (match.floodZone) tags.push({ label: `Zone ${match.floodZone}`, tone: match.floodZone === 'A' || match.floodZone === 'AE' ? 'clay' : 'default' });
  if (match.primeFarmland) tags.push({ label: 'Prime Soil', tone: 'gold' });
  else if (match.soilClassLabel) tags.push({ label: match.soilClassLabel, tone: 'default' });
  return tags.slice(0, 3);
}

export function MatchRow({ match, selected, shortlisted, onPress }: MatchRowProps) {
  const isUnread = !match.readAt;
  const tags = deriveTags(match);

  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={selected ? colors.cardBackground : 'transparent'}
        borderLeftWidth={selected ? 3 : 0}
        borderLeftColor={selected ? colors.accent : 'transparent'}
        paddingLeft={selected ? 13 : 16}
        paddingRight={16}
        paddingVertical={10}
        borderBottomWidth={1}
        borderBottomColor={colors.borderSoft}
        gap={10}
        alignItems="flex-start"
        opacity={isUnread ? 1 : 0.65}
      >
        {/* Score ring with unread dot */}
        <View style={{ position: 'relative' }}>
          <ScoreRing score={match.overallScore} size={40} />
          {isUnread && (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent,
                borderWidth: 2,
                borderColor: colors.background,
              }}
            />
          )}
        </View>

        {/* Body */}
        <YStack flex={1} gap={2}>
          <Text
            fontSize={12.5}
            fontWeight={isUnread ? '700' : '500'}
            color={colors.textPrimary}
            numberOfLines={1}
          >
            {shortlisted && (
              <Text color={colors.accent} fontSize={11}>★ </Text>
            )}
            {match.title ?? match.address}
          </Text>

          <XStack gap={4}>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {formatPrice(match.price)}
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {match.acreage ?? '—'}ac
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {match.source ?? '—'}
            </Text>
          </XStack>

          {match.llmSummary && (
            <Text fontSize={11} color={colors.textFaint} numberOfLines={2} lineHeight={15.4}>
              {match.llmSummary}
            </Text>
          )}

          {tags.length > 0 && (
            <XStack gap={4} marginTop={3} flexWrap="wrap">
              {tags.map((t) => (
                <Tag key={t.label} label={t.label} tone={t.tone} />
              ))}
            </XStack>
          )}
        </YStack>

        {/* Time */}
        <Text fontFamily="$mono" fontSize={9.5} color={colors.textFaint}>
          {formatTime(match.scoredAt)}
        </Text>
      </XStack>
    </Pressable>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/MatchRow.tsx
git commit -m "feat: add MatchRow component with score ring, meta, and tags"
```

---

## Task 13: EmptyState Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/EmptyState.tsx`

- [ ] **Step 1: Create EmptyState**

Create `apps/frontend/src/ui/dashboard/EmptyState.tsx`:

```tsx
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

export function EmptyState({
  title = 'Nothing here yet',
  subtitle = 'Your matches will show up here as they come in.',
}: EmptyStateProps) {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap={10} padding={40}>
      <Svg width={120} height={120} viewBox="0 0 160 160" fill="none" opacity={0.4}>
        <Circle cx={80} cy={80} r={60} stroke="#2C3E2D" strokeWidth={1.5} strokeDasharray="3 4" />
        <Path d="M40,95 Q70,70 100,85 T140,80" stroke="#3a5040" strokeWidth={1.2} />
        <Path d="M30,110 Q70,85 110,100 T150,95" stroke="#3a5040" strokeWidth={1.2} />
        <Circle cx={80} cy={80} r={4} fill={colors.accent} />
      </Svg>
      <Text fontFamily="$serif" fontSize={20} fontWeight="600" color={colors.textPrimary}>
        {title}
      </Text>
      <Text fontSize={13} color={colors.textSecondary} textAlign="center" maxWidth={320}>
        {subtitle}
      </Text>
    </YStack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/EmptyState.tsx
git commit -m "feat: add EmptyState component with topographic illustration"
```

---

## Task 14: MatchListPane Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/MatchListPane.tsx`

- [ ] **Step 1: Create MatchListPane**

Create `apps/frontend/src/ui/dashboard/MatchListPane.tsx`:

```tsx
import { Pressable, ScrollView, View } from 'react-native';

import type { MatchItem, SearchProfileResponse } from '@landmatch/api';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { EmptyState } from './EmptyState';
import { FilterChips, type FilterKey } from './FilterChips';
import { SlidersIcon } from './Icon';
import { MatchRow } from './MatchRow';

interface MatchListPaneProps {
  profile: SearchProfileResponse | null;
  matches: MatchItem[];
  total: number;
  selectedScoreId: string | null;
  filter: FilterKey;
  isLoading: boolean;
  shortlistedIds: Set<string>;
  counts: Record<FilterKey, number>;
  onSelectMatch: (match: MatchItem) => void;
  onFilterChange: (key: FilterKey) => void;
}

function criteriaSummary(profile: SearchProfileResponse): string {
  const c = profile.criteria;
  const parts: string[] = [];
  if (c.acreage) {
    const min = c.acreage.min ?? 0;
    const max = c.acreage.max ?? '∞';
    parts.push(`${min}–${max} ac`);
  }
  if (c.price?.max) parts.push(`≤$${(c.price.max / 1000).toFixed(0)}K`);
  if (c.soilCapabilityClass?.max) {
    const labels = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    parts.push(`Class ≤${labels[c.soilCapabilityClass.max - 1] ?? c.soilCapabilityClass.max}`);
  }
  return parts.join(' · ') || 'No criteria set';
}

export function MatchListPane({
  profile,
  matches,
  total,
  selectedScoreId,
  filter,
  isLoading,
  shortlistedIds,
  counts,
  onSelectMatch,
  onFilterChange,
}: MatchListPaneProps) {
  return (
    <YStack
      width={400}
      minWidth={400}
      borderRightWidth={1}
      borderRightColor={colors.border}
      backgroundColor={colors.background}
    >
      {/* Profile picker header */}
      <XStack
        paddingHorizontal={16}
        paddingVertical={12}
        borderBottomWidth={1}
        borderBottomColor={colors.borderSoft}
        justifyContent="space-between"
        alignItems="center"
      >
        <YStack>
          <XStack alignItems="center" gap={4}>
            <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
              {profile?.name ?? 'Select a profile'}
            </Text>
            <Text fontSize={10} color={colors.textSecondary}>▾</Text>
          </XStack>
          {profile && (
            <XStack alignItems="center" gap={5} marginTop={2}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: profile.isActive ? colors.success : colors.textFaint,
                }}
              />
              <Text fontSize={10.5} color={colors.textSecondary}>
                {criteriaSummary(profile)}
              </Text>
            </XStack>
          )}
        </YStack>
        <Pressable style={{ padding: 6 }}>
          <SlidersIcon size={13} color={colors.textSecondary} />
        </Pressable>
      </XStack>

      {/* Filter chips */}
      <FilterChips active={filter} counts={counts} onSelect={onFilterChange} />

      {/* Match list */}
      {isLoading ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner size="small" color={colors.accent} />
        </YStack>
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches"
          subtitle="Loosen a filter or expand this profile's criteria."
        />
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {matches.map((match) => (
            <MatchRow
              key={match.scoreId}
              match={match}
              selected={selectedScoreId === match.scoreId}
              shortlisted={shortlistedIds.has(match.scoreId)}
              onPress={() => onSelectMatch(match)}
            />
          ))}
        </ScrollView>
      )}
    </YStack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/MatchListPane.tsx
git commit -m "feat: add MatchListPane with profile picker, filters, and scrollable list"
```

---

## Task 15: SidebarNav Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/SidebarNav.tsx`

- [ ] **Step 1: Create SidebarNav**

Create `apps/frontend/src/ui/dashboard/SidebarNav.tsx`:

```tsx
import { Pressable, View } from 'react-native';

import type { ProfileCounts, SearchProfileResponse } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';

import {
  ArchiveIcon,
  BellIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon,
} from './Icon';

type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed';

interface SidebarNavProps {
  activeView: WorkspaceView;
  profiles: SearchProfileResponse[];
  profileCounts: ProfileCounts;
  totalUnread: number;
  totalShortlisted: number;
  totalDismissed: number;
  onSelectView: (view: WorkspaceView) => void;
  onSelectProfile: (profileId: string) => void;
}

function NavItem({
  label,
  icon,
  count,
  active,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={active ? colors.cardAlt : 'transparent'}
        borderLeftWidth={active ? 2 : 0}
        borderLeftColor={active ? colors.accent : 'transparent'}
        paddingVertical={7}
        paddingHorizontal={16}
        marginHorizontal={8}
        marginVertical={1}
        borderRadius={6}
        alignItems="center"
        gap={8}
      >
        <View style={{ opacity: active ? 1 : 0.7 }}>{icon}</View>
        <Text flex={1} fontSize={12.5} color={active ? colors.textPrimary : colors.textSecondary}>
          {label}
        </Text>
        {count !== undefined && count > 0 && (
          <Text
            fontFamily="$mono"
            fontSize={10}
            color={active ? colors.accent : colors.textFaint}
            backgroundColor={active ? 'rgba(212,168,67,0.12)' : 'transparent'}
            paddingHorizontal={active ? 6 : 0}
            paddingVertical={active ? 1 : 0}
            borderRadius={8}
          >
            {count}
          </Text>
        )}
      </XStack>
    </Pressable>
  );
}

export function SidebarNav({
  activeView,
  profiles,
  profileCounts,
  totalUnread,
  totalShortlisted,
  totalDismissed,
  onSelectView,
  onSelectProfile,
}: SidebarNavProps) {
  const countsMap = new Map(profileCounts.map((c) => [c.profileId, c]));

  return (
    <YStack
      width={220}
      minWidth={220}
      backgroundColor={colors.cardBackground}
      borderRightWidth={1}
      borderRightColor={colors.border}
    >
      {/* Brand */}
      <XStack paddingHorizontal={16} paddingTop={16} paddingBottom={20} alignItems="center" gap={10}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text fontFamily="$serif" fontWeight="700" fontSize={16} color={colors.accent}>
            L
          </Text>
        </View>
        <Text fontFamily="$serif" fontSize={16} fontWeight="600" color={colors.textPrimary}>
          Land<Text color={colors.accent}>Match</Text>
        </Text>
      </XStack>

      {/* Workspace */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={12}
        paddingBottom={6}
      >
        Workspace
      </Text>

      <NavItem
        label="Matches"
        icon={<InboxIcon size={15} color={activeView === 'inbox' ? colors.textPrimary : colors.textSecondary} />}
        count={totalUnread}
        active={activeView === 'inbox'}
        onPress={() => onSelectView('inbox')}
      />
      <NavItem
        label="Shortlist"
        icon={<StarIcon size={15} color={activeView === 'shortlist' ? colors.textPrimary : colors.textSecondary} />}
        count={totalShortlisted}
        active={activeView === 'shortlist'}
        onPress={() => onSelectView('shortlist')}
      />
      <NavItem
        label="Dismissed"
        icon={<ArchiveIcon size={15} color={activeView === 'dismissed' ? colors.textPrimary : colors.textSecondary} />}
        count={totalDismissed}
        active={activeView === 'dismissed'}
        onPress={() => onSelectView('dismissed')}
      />

      {/* Profiles */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={16}
        paddingBottom={6}
      >
        Profiles
      </Text>

      {profiles.map((p) => {
        const pc = countsMap.get(p.id);
        const newCount = pc?.unread ?? 0;
        return (
          <Pressable key={p.id} onPress={() => onSelectProfile(p.id)}>
            <XStack
              paddingVertical={7}
              paddingHorizontal={16}
              marginHorizontal={8}
              marginVertical={1}
              borderRadius={6}
              alignItems="center"
              gap={8}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: p.isActive ? colors.success : colors.textFaint,
                }}
              />
              <Text
                flex={1}
                fontSize={12.5}
                color={colors.textSecondary}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              {newCount > 0 && (
                <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
                  +{newCount}
                </Text>
              )}
            </XStack>
          </Pressable>
        );
      })}

      <Pressable>
        <XStack
          paddingVertical={7}
          paddingHorizontal={16}
          marginHorizontal={8}
          marginVertical={1}
          borderRadius={6}
          alignItems="center"
          gap={8}
        >
          <PlusIcon size={15} color={colors.textSecondary} />
          <Text fontSize={12.5} color={colors.textSecondary}>New profile</Text>
        </XStack>
      </Pressable>

      {/* Account */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={16}
        paddingBottom={6}
      >
        Account
      </Text>
      <NavItem label="Alert settings" icon={<BellIcon size={15} color={colors.textSecondary} />} onPress={() => {}} />
      <NavItem label="Settings" icon={<SettingsIcon size={15} color={colors.textSecondary} />} onPress={() => {}} />

      {/* User footer */}
      <XStack
        marginTop="auto"
        paddingHorizontal={16}
        paddingVertical={12}
        borderTopWidth={1}
        borderTopColor={colors.border}
        alignItems="center"
        gap={8}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.cardAlt,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text fontSize={10} fontWeight="600" color={colors.textSecondary}>
            U
          </Text>
        </View>
        <YStack>
          <Text fontSize={11.5} fontWeight="500" color={colors.textPrimary}>User</Text>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>user@email.com</Text>
        </YStack>
      </XStack>
    </YStack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/SidebarNav.tsx
git commit -m "feat: add SidebarNav with workspace views, profiles, and user footer"
```

---

## Task 16: Topbar Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/Topbar.tsx`

- [ ] **Step 1: Create Topbar**

Create `apps/frontend/src/ui/dashboard/Topbar.tsx`:

```tsx
import { Pressable, View } from 'react-native';

import type { SearchProfileResponse } from '@landmatch/api';
import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { BellIcon, SearchIcon } from './Icon';

type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed';

interface TopbarProps {
  view: WorkspaceView;
  profile: SearchProfileResponse | null;
  hasNotifications?: boolean;
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  inbox: 'Matches',
  shortlist: 'Shortlist',
  dismissed: 'Dismissed',
};

function formatCoord(profile: SearchProfileResponse | null): string | null {
  const center = profile?.criteria?.geography?.center;
  if (!center) return null;
  const radius = profile?.criteria?.geography?.radiusMiles ?? 60;
  return `${center.lat.toFixed(2)}°N · ${Math.abs(center.lng).toFixed(2)}°W · ${radius}mi`;
}

export function Topbar({ view, profile, hasNotifications }: TopbarProps) {
  const coord = formatCoord(profile);

  return (
    <XStack
      paddingHorizontal={20}
      paddingVertical={10}
      borderBottomWidth={1}
      borderBottomColor={colors.border}
      backgroundColor={colors.background}
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Breadcrumbs */}
      <XStack alignItems="center" gap={6}>
        <Text fontSize={12} color={colors.textSecondary}>Workspace</Text>
        <Text fontSize={12} color={colors.textFaint}>›</Text>
        <Text fontSize={12} fontWeight="600" color={colors.textPrimary}>
          {VIEW_LABELS[view]}
        </Text>
      </XStack>

      {/* Actions */}
      <XStack alignItems="center" gap={6}>
        {coord && (
          <XStack
            backgroundColor={colors.cardBackground}
            borderWidth={1}
            borderColor={colors.border}
            paddingHorizontal={10}
            paddingVertical={3}
            borderRadius={12}
            marginRight={4}
          >
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              {coord}
            </Text>
          </XStack>
        )}
        <Pressable style={{ width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}>
          <SearchIcon size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={{ width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <BellIcon size={14} color={colors.textSecondary} />
          {hasNotifications && (
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </Pressable>
      </XStack>
    </XStack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/Topbar.tsx
git commit -m "feat: add Topbar with breadcrumbs, coord chip, and icon buttons"
```

---

## Task 17: ShortlistView Component

**Files:**
- Create: `apps/frontend/src/ui/dashboard/ShortlistView.tsx`

- [ ] **Step 1: Create ShortlistView**

Create `apps/frontend/src/ui/dashboard/ShortlistView.tsx`:

```tsx
import { Pressable, ScrollView } from 'react-native';

import type { MatchItem } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { EmptyState } from './EmptyState';
import { ScoreRing } from './ScoreRing';

interface ShortlistViewProps {
  matches: MatchItem[];
  dismissed?: boolean;
  onOpenMatch: (match: MatchItem) => void;
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1000).toFixed(0)}K`;
}

export function ShortlistView({ matches, dismissed, onOpenMatch }: ShortlistViewProps) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title={dismissed ? 'Nothing dismissed' : 'No shortlisted properties yet'}
        subtitle={
          dismissed
            ? 'Properties you archive from the inbox show up here.'
            : 'Star a property in the inbox to save it here.'
        }
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
      <Text fontFamily="$mono" fontSize={10} textTransform="uppercase" letterSpacing={1} color={colors.textFaint}>
        {dismissed ? 'Dismissed' : 'Shortlist'}
      </Text>
      <Text fontFamily="$serif" fontSize={20} fontWeight="600" color={colors.textPrimary} marginTop={4}>
        {dismissed ? 'Dismissed properties' : 'Your shortlisted properties'}
      </Text>
      <Text fontSize={13} color={colors.textSecondary} marginTop={4} marginBottom={20}>
        {matches.length} {matches.length === 1 ? 'property' : 'properties'}.
      </Text>

      <XStack flexWrap="wrap" gap={12}>
        {matches.map((m) => (
          <Pressable key={m.scoreId} onPress={() => onOpenMatch(m)} style={{ width: 300 }}>
            <YStack
              backgroundColor={colors.cardBackground}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius={8}
              padding={16}
              gap={8}
            >
              <XStack justifyContent="space-between" alignItems="flex-start">
                <YStack flex={1} marginRight={8}>
                  <Text fontSize={13} fontWeight="600" color={colors.textPrimary} numberOfLines={1}>
                    {m.title ?? m.address}
                  </Text>
                  <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary} marginTop={2}>
                    {formatPrice(m.price)} · {m.acreage ?? '—'}ac · {m.source ?? '—'}
                  </Text>
                </YStack>
                <ScoreRing score={m.overallScore} size={40} />
              </XStack>

              {m.llmSummary && (
                <Text fontSize={12} color={colors.textSecondary} lineHeight={18} numberOfLines={3}>
                  {m.llmSummary}
                </Text>
              )}

              <XStack justifyContent="space-between">
                <Text fontFamily="$mono" fontSize={9.5} color={colors.textFaint}>
                  {m.soilClassLabel ?? '—'} · Zone {m.floodZone ?? '—'}
                </Text>
              </XStack>
            </YStack>
          </Pressable>
        ))}
      </XStack>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/ui/dashboard/ShortlistView.tsx
git commit -m "feat: add ShortlistView card grid for shortlisted and dismissed matches"
```

---

## Task 18: AppShell Layout + Route Wiring

**Files:**
- Create: `apps/frontend/src/ui/dashboard/AppShell.tsx`
- Modify: `apps/frontend/app/(app)/_layout.tsx`
- Create: `apps/frontend/app/(app)/index.tsx`
- Create: `apps/frontend/app/(app)/shortlist.tsx`
- Create: `apps/frontend/app/(app)/dismissed.tsx`

- [ ] **Step 1: Create AppShell**

Create `apps/frontend/src/ui/dashboard/AppShell.tsx`:

```tsx
import { View } from 'react-native';

import type { MatchItem, SearchProfileResponse, ProfileCounts } from '@landmatch/api';
import { Spinner, YStack, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { useProfileCounts, useSearchProfiles } from '@/src/api/hooks';

import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';

type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed';

interface AppShellProps {
  view: WorkspaceView;
  selectedProfileId: string | null;
  onChangeView: (view: WorkspaceView) => void;
  onChangeProfile: (profileId: string) => void;
  children: React.ReactNode;
}

export function AppShell({
  view,
  selectedProfileId,
  onChangeView,
  onChangeProfile,
  children,
}: AppShellProps) {
  const { data: profiles = [] } = useSearchProfiles();
  const { data: profileCounts = [] } = useProfileCounts();

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;

  // Aggregate counts for sidebar badges
  const totalUnread = profileCounts.reduce((sum, c) => sum + c.unread, 0);
  const totalShortlisted = profileCounts.reduce((sum, c) => sum + c.shortlisted, 0);
  const totalDismissed = 0; // TODO: add dismissed count to ProfileCounts if needed

  return (
    <XStack flex={1} backgroundColor={colors.background}>
      <SidebarNav
        activeView={view}
        profiles={profiles}
        profileCounts={profileCounts}
        totalUnread={totalUnread}
        totalShortlisted={totalShortlisted}
        totalDismissed={totalDismissed}
        onSelectView={onChangeView}
        onSelectProfile={(id) => {
          onChangeProfile(id);
          onChangeView('inbox');
        }}
      />
      <YStack flex={1}>
        <Topbar
          view={view}
          profile={selectedProfile}
          hasNotifications={totalUnread > 0}
        />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {children}
        </View>
      </YStack>
    </XStack>
  );
}
```

- [ ] **Step 2: Update (app)/_layout.tsx**

Replace the contents of `apps/frontend/app/(app)/_layout.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';

import { Redirect } from 'expo-router';
import { Spinner, YStack } from 'tamagui';

import { useSearchProfiles } from '@/src/api/hooks';
import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';
import { AppShell } from '@/src/ui/dashboard/AppShell';

import InboxScreen from './index';
import ShortlistScreen from './shortlist';
import DismissedScreen from './dismissed';

type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed';

export default function AppLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: profiles } = useSearchProfiles();
  const [view, setView] = useState<WorkspaceView>('inbox');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Auto-select first profile once loaded
  useEffect(() => {
    if (!selectedProfileId && profiles && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  if (authLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor={colors.background}>
        <Spinner size="large" color={colors.accent} />
      </YStack>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <AppShell
      view={view}
      selectedProfileId={selectedProfileId}
      onChangeView={setView}
      onChangeProfile={setSelectedProfileId}
    >
      {view === 'inbox' && (
        <InboxScreen profileId={selectedProfileId} />
      )}
      {view === 'shortlist' && (
        <ShortlistScreen profileId={selectedProfileId} />
      )}
      {view === 'dismissed' && (
        <DismissedScreen profileId={selectedProfileId} />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Create inbox screen**

Create `apps/frontend/app/(app)/index.tsx`:

```tsx
import { useCallback, useState } from 'react';

import type { MatchItem } from '@landmatch/api';
import { Text, YStack } from 'tamagui';

import {
  useProfileMatches,
  useProfileCounts,
  useSearchProfiles,
  useUpdateMatchStatus,
} from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { EmptyState } from '@/src/ui/dashboard/EmptyState';
import { type FilterKey } from '@/src/ui/dashboard/FilterChips';
import { MatchListPane } from '@/src/ui/dashboard/MatchListPane';

interface InboxScreenProps {
  profileId: string | null;
}

export default function InboxScreen({ profileId }: InboxScreenProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const queryParams = {
    ...(filter === 'strong' ? { minScore: 80 } : {}),
    ...(filter === 'shortlist' ? { status: 'shortlisted' as const } : {}),
    limit: 50,
  };

  const { data, isLoading } = useProfileMatches(profileId, queryParams);
  const { data: profileCounts = [] } = useProfileCounts();
  const { data: profiles = [] } = useSearchProfiles();
  const updateStatus = useUpdateMatchStatus();

  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const matches = data?.items ?? [];
  const total = data?.total ?? 0;

  // Client-side filtering for unread (server doesn't have a direct unread filter)
  const filteredMatches = filter === 'unread'
    ? matches.filter((m) => !m.readAt && m.status === 'inbox')
    : matches;

  // Derive shortlisted IDs from current matches
  const shortlistedIds = new Set(matches.filter((m) => m.status === 'shortlisted').map((m) => m.scoreId));

  // Compute counts from current data
  const profileCount = profileCounts.find((c) => c.profileId === profileId);
  const counts: Record<FilterKey, number> = {
    all: profileCount?.total ?? 0,
    unread: profileCount?.unread ?? 0,
    strong: matches.filter((m) => m.overallScore >= 80).length,
    shortlist: profileCount?.shortlisted ?? 0,
  };

  const handleSelectMatch = useCallback(
    (match: MatchItem) => {
      setSelectedScoreId(match.scoreId);
      if (!match.readAt) {
        updateStatus.mutate({ scoreId: match.scoreId, data: { markAsRead: true } });
      }
    },
    [updateStatus],
  );

  if (!profileId) {
    return <EmptyState title="No profile selected" subtitle="Select or create a search profile to see matches." />;
  }

  return (
    <>
      <MatchListPane
        profile={profile}
        matches={filteredMatches}
        total={total}
        selectedScoreId={selectedScoreId}
        filter={filter}
        isLoading={isLoading}
        shortlistedIds={shortlistedIds}
        counts={counts}
        onSelectMatch={handleSelectMatch}
        onFilterChange={setFilter}
      />

      {/* Detail pane stub — replaced by dkw.4 */}
      <YStack flex={1} justifyContent="center" alignItems="center" gap={10}>
        <Text fontSize={13} color={colors.textFaint}>
          {selectedScoreId ? 'Property report coming in dkw.4' : 'Select a match to view details'}
        </Text>
      </YStack>
    </>
  );
}
```

- [ ] **Step 4: Create shortlist screen**

Create `apps/frontend/app/(app)/shortlist.tsx`:

```tsx
import { useProfileMatches } from '@/src/api/hooks';
import { ShortlistView } from '@/src/ui/dashboard/ShortlistView';

interface ShortlistScreenProps {
  profileId: string | null;
}

export default function ShortlistScreen({ profileId }: ShortlistScreenProps) {
  const { data } = useProfileMatches(profileId, { status: 'shortlisted', limit: 100 });
  const matches = data?.items ?? [];

  return (
    <ShortlistView
      matches={matches}
      onOpenMatch={() => {
        // Navigate to detail view — wired in dkw.4
      }}
    />
  );
}
```

- [ ] **Step 5: Create dismissed screen**

Create `apps/frontend/app/(app)/dismissed.tsx`:

```tsx
import { useProfileMatches } from '@/src/api/hooks';
import { ShortlistView } from '@/src/ui/dashboard/ShortlistView';

interface DismissedScreenProps {
  profileId: string | null;
}

export default function DismissedScreen({ profileId }: DismissedScreenProps) {
  const { data } = useProfileMatches(profileId, { status: 'dismissed', limit: 100 });
  const matches = data?.items ?? [];

  return (
    <ShortlistView
      matches={matches}
      dismissed
      onOpenMatch={() => {
        // Navigate to detail view — wired in dkw.4
      }}
    />
  );
}
```

- [ ] **Step 6: Remove old search screen**

Delete `apps/frontend/app/(app)/search/index.tsx` — the new `index.tsx` replaces it.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/ui/dashboard/AppShell.tsx apps/frontend/app/(app)/_layout.tsx apps/frontend/app/(app)/index.tsx apps/frontend/app/(app)/shortlist.tsx apps/frontend/app/(app)/dismissed.tsx
git rm apps/frontend/app/(app)/search/index.tsx
git commit -m "feat: wire AppShell layout with inbox, shortlist, and dismissed views"
```

---

## Task 19: Verify End-to-End

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`
Expected: Both server and frontend start without errors

- [ ] **Step 2: Register/login**

Open the app, register a user or login. Confirm auth flow works and redirects to the dashboard.

- [ ] **Step 3: Verify dashboard renders**

Confirm:
- Sidebar nav appears with brand mark, workspace views, profile list
- Topbar shows breadcrumbs and coordinate chip
- Match list pane shows (empty state if no profiles/matches)
- Filter chips render and toggle

- [ ] **Step 4: Test with seeded data**

If there are scored listings in the database:
- Confirm matches load in the list pane
- Confirm score rings render with correct colors
- Confirm clicking a match marks it as read (dot disappears)
- Confirm shortlist/dismiss filter chips work

- [ ] **Step 5: Test shortlist and dismiss**

This requires adding shortlist/dismiss buttons to the match detail area or match row. For now, test via the API directly:

```bash
curl -X PATCH http://localhost:3000/api/v1/scores/<score-id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "shortlisted"}'
```

Confirm the match moves to the shortlist view.

- [ ] **Step 6: Commit any fixes**

If any issues found during verification, fix and commit.

---

## Verification Summary

1. `pnpm dev` — both server and frontend start
2. Auth flow works (login/register → dashboard)
3. Dashboard 3-panel layout renders correctly
4. Sidebar shows profiles with badge counts
5. Match list loads from API and displays score rings, meta, tags
6. Filter chips toggle between All/Unread/≥80/★
7. Clicking a match marks it as read
8. Shortlist and Dismissed views render
9. `pnpm lint` passes
10. `pnpm --filter @landmatch/server build` compiles
