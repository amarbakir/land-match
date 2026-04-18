# Phase 3: Search Profiles & Feed Monitoring — Design Spec

## Overview

Add search profile CRUD, automated feed ingestion from land listing sites, cron-based enrichment, and criteria matching that scores listings against user profiles and creates pending alerts.

## Design Decisions

- **SearchCriteria Zod schema** in `@landmatch/api` is the single source of truth. `@landmatch/scoring` imports the inferred TypeScript type — no duplicate interface.
- **`@landmatch/feeds`** is a new standalone package (not inside enrichment). Feeds and enrichment are separate concerns: different external dependencies, different I/O patterns (pull-based RSS parsing vs coordinate-based API calls), different failure modes.
- **In-process cron** via `node-cron` inside the Hono server. Job logic lives in a testable service; the cron just calls it. Easy to migrate to external triggers (SST Cron / EventBridge) later.
- **Two feed sources** implemented to surface abstraction boundaries. Designed for N sources from day one.
- **LLM summaries skipped during batch matching** to keep the cron fast. Generated on-demand when a user views a match.
- **Pending alert records created during matching** so Phase 4 only needs to add delivery logic.
- **Auth placeholder**: `x-user-id` header for dev until auth middleware is built.

---

## Data Model

### Schema Change: Unique Constraint

Add a unique index on `(external_id, source)` to the `listings` table. Required for feed upsert deduplication. This requires a new Drizzle migration.

### Existing Tables (otherwise no changes)

The DB schema already supports Phase 3:

- **search_profiles** — userId, name, isActive, alertFrequency, alertThreshold, criteria (jsonb)
- **listings** — externalId, source, enrichmentStatus, firstSeenAt/lastSeenAt/delistedAt lifecycle
- **enrichments** — 1:1 with listings, soil/flood/parcel/climate data
- **scores** — listingId + searchProfileId, overallScore, componentScores (jsonb), llmSummary
- **alerts** — userId, searchProfileId, listingId, scoreId, channel, status (pending/sent/failed)

### New Zod Schemas (`@landmatch/api`)

**SearchCriteria** — Zod version of the criteria shape, replaces the hand-written TypeScript interface in `@landmatch/scoring`:

```typescript
const SearchCriteria = z.object({
  acreage: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  price: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  soilCapabilityClass: z.object({ max: z.number() }).optional(),
  floodZoneExclude: z.array(z.string()).optional(),
  geography: z.object({
    type: z.enum(['radius', 'counties', 'driveTime']),
    center: z.object({ lat: z.number(), lng: z.number() }).optional(),
    radiusMiles: z.number().optional(),
  }).optional(),
  zoning: z.array(z.string()).optional(),
  infrastructure: z.array(z.string()).optional(),
  climateRisk: z.object({
    maxFireRisk: z.number().optional(),
    maxFloodRisk: z.number().optional(),
  }).optional(),
  weights: z.record(z.number()).optional(),
});
```

**Search profile schemas:**

```typescript
const CreateSearchProfile = z.object({
  name: z.string().min(1),
  alertFrequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
  alertThreshold: z.number().int().min(0).max(100).default(60),
  criteria: SearchCriteria,
  isActive: z.boolean().default(true),
});

const UpdateSearchProfile = CreateSearchProfile.partial();

const SearchProfileResponse = z.object({
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
```

### Scoring Package Migration

Remove the hand-written `SearchCriteria` interface from `packages/scoring/src/types.ts`. Import from `@landmatch/api` instead:

```typescript
import type { SearchCriteria } from '@landmatch/api';
```

The `weights` field typing changes from `Partial<ScoringWeights>` to `Record<string, number>` at the Zod layer, which is compatible since the scorer spreads it over `DEFAULT_WEIGHTS`.

---

## Feed Ingestion (`@landmatch/feeds`)

### Package Structure

```
packages/feeds/
  package.json          # @landmatch/feeds
  tsconfig.json
  vitest.config.ts
  src/
    index.ts            # exports FeedAdapter, RawListing, runFeedIngestion
    types.ts            # FeedAdapter interface, RawListing type
    orchestrator.ts     # runs all registered adapters
    adapters/
      landwatch.ts      # LandWatch RSS adapter
      land-com.ts       # Land.com RSS adapter (or alternative)
```

### Adapter Interface

```typescript
interface FeedAdapter {
  name: string;
  fetchListings(): Promise<Result<RawListing[]>>;
}

interface RawListing {
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
```

Each adapter handles its own parsing: RSS structure, price/acreage extraction from text, field normalization. The `RawListing` shape maps directly to `listings` table columns.

### Feed Orchestrator

```typescript
async function runFeedIngestion(adapters: FeedAdapter[]): Promise<FeedIngestionResult> {
  // Runs all adapters via Promise.allSettled
  // Aggregates results, logs per-adapter success/failure
  // Returns { listings: RawListing[], errors: { adapter: string, error: string }[] }
}
```

No deduplication at this layer — that's handled by the server repo's upsert on `externalId + source`.

### Initial Adapters

Two sources to start. Both serve rural/agricultural land listings:

1. **LandWatch** — RSS feed with land listings, well-structured entries
2. **Land.com** (or LandAndFarm/Lands of America as fallback) — second source to validate adapter abstraction

Adapter selection will be confirmed during implementation based on RSS feed availability and structure.

---

## Server Layer

### Search Profile CRUD

**Repo** (`apps/server/src/repos/searchProfileRepo.ts`):
- `insert(profile, tx?)` — insert new profile
- `findById(id, tx?)` — get by ID
- `findByUserId(userId, tx?)` — get all profiles for a user
- `findActive(tx?)` — get all active profiles (for matching)
- `update(id, data, tx?)` — partial update
- `deleteById(id, tx?)` — hard delete

**Service** (`apps/server/src/services/searchProfileService.ts`):
- `create(userId, input)` → `Result<SearchProfile>`
- `getById(userId, id)` → `Result<SearchProfile>` (validates ownership)
- `listByUser(userId)` → `Result<SearchProfile[]>`
- `update(userId, id, input)` → `Result<SearchProfile>` (validates ownership)
- `delete(userId, id)` → `Result<void>` (validates ownership)

**Routes** (`apps/server/src/routes/searchProfiles.ts`), mounted at `/api/v1/search-profiles`:
- `POST /` — create profile
- `GET /` — list user's profiles
- `GET /:id` — get one profile
- `PUT /:id` — update profile
- `DELETE /:id` — delete profile

Auth: `x-user-id` header for dev. Real auth middleware is a separate concern.

### Listing Repo Extensions

Add to existing `listingRepo.ts`:
- `upsertFromFeed(listing)` — insert or update `lastSeenAt` on conflict (`externalId + source`)
- `findPendingEnrichment(limit)` — listings where `enrichmentStatus = 'pending'`

### Score Repo (`apps/server/src/repos/scoreRepo.ts`)

- `insert(score, tx?)` — persist a scoring result
- `findByListingAndProfile(listingId, profileId, tx?)` — dedup check
- `findByProfileId(profileId, opts?, tx?)` — browse matches for a profile (sorted by score desc)

### Alert Repo (`apps/server/src/repos/alertRepo.ts`)

- `insert(alert, tx?)` — create pending alert
- `findByListingAndProfile(listingId, profileId, tx?)` — dedup check
- `findPendingByUser(userId, tx?)` — for Phase 4 delivery

---

## Cron Job & Pipeline Orchestration

### Scheduler (`apps/server/src/jobs/scheduler.ts`)

Uses `node-cron` to register a single recurring job at server startup. Configurable interval (default: every 30 minutes).

A `jobRunning` guard prevents overlapping runs.

### Feed Pipeline Service (`apps/server/src/services/feedPipelineService.ts`)

The cron calls this service. Three sequential stages:

**Stage 1 — Ingest:**
- Call feed orchestrator with all registered adapters
- Upsert results via `listingRepo.upsertFromFeed()`
- New listings get `enrichmentStatus: 'pending'`
- Existing listings get `lastSeenAt` bumped
- Log: number ingested, number new, number updated

**Stage 2 — Enrich:**
- Query `listingRepo.findPendingEnrichment(limit)`
- For each listing: geocode → run enrichment pipeline → persist enrichment → update status to `'complete'` or `'failed'`
- Process in batches with concurrency limit (5 at a time) to respect external API rate limits
- Log: number enriched, number failed

**Stage 3 — Match:**
- For each newly enriched listing (status just moved to `'complete'` in this run):
  - Load listing + enrichment
  - Load all active search profiles via `searchProfileRepo.findActive()`
  - For each profile: call `scoreListing()` from `@landmatch/scoring`
  - Persist score via `scoreRepo.insert()`
  - If `overallScore >= profile.alertThreshold`:
    - Check dedup: no existing alert for this listing + profile
    - Insert pending alert via `alertRepo.insert()` with `channel: 'email'`, `status: 'pending'`
- Log: number scored, number alerts created

### Why Sequential

Stages must run in order: can't enrich what hasn't been ingested, can't match what hasn't been enriched. Within each stage, work is parallelized where safe (feed adapters run concurrently, enrichment batches run with controlled concurrency).

---

## Matching Service (`apps/server/src/services/matchingService.ts`)

Extracted from Stage 3 for testability:

```typescript
async function matchListingAgainstProfiles(
  listingId: string
): Promise<Result<{ scored: number; alertsCreated: number }>>
```

- Loads listing + enrichment from DB
- Loads all active search profiles
- For each profile: scores, persists, creates alert if threshold met and not already alerted
- Returns summary counts

This service is also callable outside the cron (e.g., after manual enrichment via the existing `/api/v1/listings/enrich` endpoint).

---

## What This Design Does NOT Cover

- **Auth middleware** — separate concern, use `x-user-id` header for dev
- **Email/SMS delivery** — Phase 4 (alerts table populated with `pending` records here)
- **Frontend screens** — Phase 5 (dashboard, profile management, match browsing)
- **LLM summaries in batch** — generated on-demand when user views a match, not during cron
- **Additional feed sources** — designed for N, implementing 2
- **Listing deduplication across sources** — same property on LandWatch and Land.com gets two listing records with different `source` values. Cross-source dedup is Phase 6+.
