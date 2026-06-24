# Persist homesteadScore at enrichment time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each listing's default homestead score on the `enrichments` row at enrichment time, and read it back in `getSavedListings` instead of recomputing per request.

**Architecture:** Add a nullable `homestead_score` integer column to `enrichments`. Compute the score once inside `enrichAndPersist`'s transaction (via the existing canonical `computeHomestead` mapper) and store it. `getSavedListings` reads the column, falling back to on-the-fly compute only when the column is `null`. A one-time, idempotent backfill script populates existing rows.

**Tech Stack:** Drizzle ORM (Postgres), Hono, TypeScript, Vitest, `@landmatch/scoring`.

## Global Constraints

- Score column is **nullable integer**: `null` = compute error / not-yet-backfilled; `0` = a valid score. Readers MUST use `!= null` checks, never truthiness.
- DB layering: repos contain Drizzle queries only and return domain rows (not `Result`); services orchestrate and return `Result<T>`. (`apps/server/CLAUDE.md`)
- Column names are snake_case in schema; Drizzle property names are camelCase.
- Schema changes REQUIRE a generated Drizzle migration — never hand-write SQL.
- Use `pnpm`, not npm/yarn. Tests run via `pnpm --filter @landmatch/server test`.
- Commit messages: simple, no "Co-Authored-By". Reference bead `land-match-i1b`.

---

### Task 1: Add `homestead_score` column + migration

**Files:**
- Modify: `packages/db/src/schema.ts` (enrichments table, after `sourcesUsed` ~line 100)
- Create: `packages/db/drizzle/<generated>.sql` (via drizzle-kit)

**Interfaces:**
- Produces: `enrichments.homesteadScore` column (Drizzle `integer`, nullable), DB column `homestead_score`.

- [ ] **Step 1: Add the column to the schema**

In `packages/db/src/schema.ts`, inside the `enrichments` `pgTable`, in the `// Meta` group (right after the `sourcesUsed` line), add:

```ts
  // Computed
  homesteadScore: integer('homestead_score'),
```

(`integer` is already imported at the top of the file — no import change needed.)

- [ ] **Step 2: Generate the migration**

Use the `drizzle-migrations` skill. Run:

```bash
pnpm --filter @landmatch/db db:generate
```

Expected: a new `packages/db/drizzle/NNNN_*.sql` file containing `ALTER TABLE "enrichments" ADD COLUMN "homestead_score" integer;`. No other table should change.

- [ ] **Step 3: Verify the generated SQL**

Read the generated `.sql` file. Confirm it contains exactly the `ADD COLUMN "homestead_score" integer;` statement and nothing unrelated. If drizzle-kit produced extra/unexpected statements, stop and investigate (do not edit the SQL by hand).

- [ ] **Step 4: Build the db package to confirm types**

Run:

```bash
pnpm --filter @landmatch/db build
```

Expected: PASS (no TypeScript errors).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/db/src/schema.ts packages/db/drizzle/
rtk git commit -m "Add homestead_score column to enrichments (land-match-i1b)"
```

---

### Task 2: Repo — `updateHomesteadScore` + expose column in `findSavedListings`

**Files:**
- Modify: `apps/server/src/repos/listingRepo.ts` (add function ~after `insertEnrichment` line 117; add field to `findSavedListings` select ~line 247)

**Interfaces:**
- Consumes: `enrichments.homesteadScore` (Task 1), `eq` and `db`/`Tx` (already imported at top of file).
- Produces:
  - `updateHomesteadScore(listingId: string, score: number | null, tx?: Tx): Promise<void>`
  - `findSavedListings` rows now include `homesteadScore: number | null`.

- [ ] **Step 1: Add `homesteadScore` to the `findSavedListings` select projection**

In `apps/server/src/repos/listingRepo.ts`, in the `conn.select({ ... })` object inside `findSavedListings` (the block around lines 245–262), add this line next to the other `enrichments.*` fields (e.g. right after `zoning: enrichments.zoningCode,`):

```ts
        homesteadScore: enrichments.homesteadScore,
```

- [ ] **Step 2: Add the `updateHomesteadScore` function**

In the same file, immediately after the `insertEnrichment` function (after its closing brace at ~line 117), add:

```ts
export async function updateHomesteadScore(
  listingId: string,
  score: number | null,
  tx?: Tx,
) {
  await (tx ?? db)
    .update(enrichments)
    .set({ homesteadScore: score })
    .where(eq(enrichments.listingId, listingId));
}
```

(`enrichments`, `eq`, `db`, and `Tx` are already imported at the top of the file.)

- [ ] **Step 3: Typecheck the server package**

Run:

```bash
rtk tsc -p apps/server/tsconfig.json --noEmit
```

Expected: PASS. (The `findSavedListings` return type now includes `homesteadScore`; the consuming service is updated in Task 4, but adding a field to the select does not break compilation on its own.)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/server/src/repos/listingRepo.ts
rtk git commit -m "Add updateHomesteadScore repo fn and expose column in findSavedListings (land-match-i1b)"
```

---

### Task 3: Write the score at enrich time

**Files:**
- Modify: `apps/server/src/services/listingService.ts` (the `enrichAndPersist` transaction, ~lines 77–101)
- Test: `apps/server/src/__tests__/listingService.test.ts` (add to the `enrichAndPersist` describe block; extend the `vi.mock('../repos/listingRepo', ...)` at ~line 15)

**Interfaces:**
- Consumes: `listingRepo.updateHomesteadScore` (Task 2); existing module-private `computeHomestead(listing, enrichment)` which returns `{ homesteadScore: number | null, homesteadComponents: ... }`.
- Produces: after `enrichAndPersist`, the listing's enrichment row has `homestead_score` set.

- [ ] **Step 1: Add `updateHomesteadScore` to the repo mock**

In `apps/server/src/__tests__/listingService.test.ts`, the `vi.mock('../repos/listingRepo', () => ({ ... }))` factory (around line 15) lists the mocked exports. Add `updateHomesteadScore: vi.fn(),` to that object, then add a `vi.mocked` handle near the other handles (~line 33):

```ts
const mockUpdateHomesteadScore = vi.mocked(listingRepo.updateHomesteadScore);
```

- [ ] **Step 2: Write the failing test**

Add this test inside the `describe('enrichAndPersist', ...)` block:

```ts
it('computes and persists homesteadScore within the transaction', async () => {
  // Bug this catches: if the score is never written, getSavedListings has
  // nothing to read and silently falls back to per-request compute forever.
  mockEnrichListing.mockResolvedValue(makeEnrichResult());

  await enrichAndPersist({ address: '123 Rural Rd, MO', price: 50000, acreage: 40 });

  expect(mockUpdateHomesteadScore).toHaveBeenCalledTimes(1);
  const [listingId, score, tx] = mockUpdateHomesteadScore.mock.calls[0];
  expect(listingId).toBe(listingRow.id); // same listing inserted in this txn
  expect(typeof score).toBe('number');   // a real, enriched listing scores a number
  expect(tx).toBe('fake-tx');            // written inside the transaction
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm --filter @landmatch/server test -- listingService.test.ts -t "persists homesteadScore"
```

Expected: FAIL — `mockUpdateHomesteadScore` received 0 calls (the production code does not call it yet).

- [ ] **Step 4: Implement the write in `enrichAndPersist`**

In `apps/server/src/services/listingService.ts`, inside the `db.transaction(async (tx) => { ... })` block of `enrichAndPersist`, after the `insertEnrichment` call and before `return { listing, enrichmentRow };`, add:

```ts
      const { homesteadScore: hsScore } = computeHomestead(listing, enrichmentRow);
      await listingRepo.updateHomesteadScore(listing.id, hsScore, tx);
```

`computeHomestead` is already defined in this file (~line 12) and `listingRepo` is already imported.

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
pnpm --filter @landmatch/server test -- listingService.test.ts
```

Expected: PASS — the new test passes and all existing `enrichAndPersist` tests still pass.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/server/src/services/listingService.ts apps/server/src/__tests__/listingService.test.ts
rtk git commit -m "Persist homesteadScore in enrichAndPersist transaction (land-match-i1b)"
```

---

### Task 4: Read the persisted score in `getSavedListings`, fall back when null

**Files:**
- Modify: `apps/server/src/services/listingService.ts` (`getSavedListings` map callback, ~lines 134–185)
- Test: `apps/server/src/__tests__/savedListingsService.test.ts` (extend `makeSavedRow` ~line 20; add tests in `describe('getSavedListings')`)

**Interfaces:**
- Consumes: `findSavedListings` rows now carry `homesteadScore: number | null` (Task 2).
- Produces: response item `homesteadScore` equals the persisted column when set, else the computed fallback.

- [ ] **Step 1: Add `homesteadScore` to the test row factory**

In `apps/server/src/__tests__/savedListingsService.test.ts`, the `makeSavedRow` factory builds a `SavedRow` (inferred from the repo return type, which now includes `homesteadScore`). Add a default to the returned object (near the other enrichment fields, before `bestScoreValue`):

```ts
    homesteadScore: null,
```

Defaulting to `null` keeps the existing tests exercising the compute fallback, so their assertions remain valid.

- [ ] **Step 2: Write the failing tests**

Add these tests inside `describe('getSavedListings', ...)`:

```ts
it('returns the persisted homesteadScore when present, without recomputing', async () => {
  // Bug this catches: if the read path ignores the stored column and always
  // recomputes, the persistence work is pointless. The fixture uses a score
  // (7) that the scorer would never produce for this good-soil row, so a pass
  // proves we read the column rather than recomputing.
  mockFindSaved.mockResolvedValue({
    rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: 7 })],
    total: 1,
  });

  const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.items[0].homesteadScore).toBe(7);
  }
});

it('treats a persisted score of 0 as valid, not a fallback trigger', async () => {
  // Bug this catches: a `homesteadScore || compute()` truthiness check would
  // discard a legitimate 0 (hard-filtered listing) and recompute.
  mockFindSaved.mockResolvedValue({
    rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: 0 })],
    total: 1,
  });

  const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.items[0].homesteadScore).toBe(0);
  }
});

it('falls back to computing the score when the persisted column is null', async () => {
  // Bug this catches: pre-backfill rows have null homesteadScore; if there is
  // no fallback the UI shows no score ring for them.
  mockFindSaved.mockResolvedValue({
    rows: [makeSavedRow({ soilClass: 2, floodZone: 'X', homesteadScore: null })],
    total: 1,
  });

  const result = await getSavedListings('user-1', { sort: 'date', sortDir: 'desc', limit: 20, offset: 0 });

  expect(result.ok).toBe(true);
  if (result.ok) {
    const score = result.data.items[0].homesteadScore;
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(40); // good soil (class 2) + minimal flood (X)
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @landmatch/server test -- savedListingsService.test.ts -t "persisted"
```

Expected: FAIL — the "returns the persisted homesteadScore" test fails because the service currently always recomputes (ignoring `row.homesteadScore`), so it returns the computed score instead of `7`.

- [ ] **Step 4: Implement the read-with-fallback**

In `apps/server/src/services/listingService.ts`, in the `getSavedListings` `rows.map((row) => { ... })` callback, replace the score-computation block (currently `let hsScore: number | null = null;` followed by the `try { ... } catch { ... }`) with:

```ts
      let hsScore: number | null = row.homesteadScore;
      if (hsScore == null) {
        try {
          const listingRow: ListingRow = {
            price: row.price,
            acreage: row.acreage,
            latitude: row.lat,
            longitude: row.lng,
          };
          const enrichmentRow: EnrichmentRow = {
            soilCapabilityClass: row.soilClass,
            soilDrainageClass: row.soilDrainageClass,
            soilTexture: row.soilTexture,
            femaFloodZone: row.floodZone,
            zoningCode: row.zoning,
            fireRiskScore: row.fireRiskScore,
            floodRiskScore: row.floodRiskScore,
            frostFreeDays: row.frostFreeDays,
            annualPrecipIn: row.annualPrecipIn,
            avgMinTempF: row.avgMinTempF,
            avgMaxTempF: row.avgMaxTempF,
            growingSeasonDays: row.growingSeasonDays,
            elevationFt: row.elevationFt,
            slopePct: row.slopePct,
            wetlandType: row.wetlandType,
            wetlandWithinBufferFt: row.wetlandWithinBufferFt,
          };
          const result = homesteadScore(mapListingRow(listingRow), mapEnrichmentRow(enrichmentRow), {});
          hsScore = result.homesteadScore;
        } catch { /* scoring failure is non-fatal */ }
      }
```

The rest of the returned item object (which already sets `homesteadScore: hsScore`) is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @landmatch/server test -- savedListingsService.test.ts
```

Expected: PASS — the three new tests pass and all existing `getSavedListings` tests (which use `homesteadScore: null` and assert computed values) still pass.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/server/src/services/listingService.ts apps/server/src/__tests__/savedListingsService.test.ts
rtk git commit -m "Read persisted homesteadScore with compute fallback in getSavedListings (land-match-i1b)"
```

---

### Task 5: One-time backfill script

**Files:**
- Modify: `apps/server/src/services/listingService.ts` (add `export` to `computeHomestead`)
- Create: `apps/server/scripts/backfill-homestead-score.ts`
- Modify: `apps/server/package.json` (add `backfill:homestead` script)

**Interfaces:**
- Consumes: exported `computeHomestead`, `listingRepo.updateHomesteadScore` (Task 2), `db` from `../src/db/client`, `listings`/`enrichments` from `@landmatch/db`, `eq`/`isNull` from `drizzle-orm`.
- Produces: a runnable `pnpm --filter @landmatch/server backfill:homestead` that sets `homestead_score` for all enrichment rows where it is `null`.

- [ ] **Step 1: Export `computeHomestead`**

In `apps/server/src/services/listingService.ts`, change the declaration `function computeHomestead(` (~line 12) to:

```ts
export function computeHomestead(
```

- [ ] **Step 2: Create the backfill script**

Create `apps/server/scripts/backfill-homestead-score.ts`:

```ts
/**
 * Backfill script: computes and persists homestead_score for enrichment rows
 * where it is currently null. Idempotent — only touches null rows, safe to re-run.
 *
 * Usage: pnpm --filter @landmatch/server backfill:homestead
 */
import '../src/config'; // triggers dotenv

import { eq, isNull } from 'drizzle-orm';
import { enrichments, listings } from '@landmatch/db';

import { db } from '../src/db/client';
import { computeHomestead } from '../src/services/listingService';

async function main() {
  const rows = await db
    .select({ listing: listings, enrichment: enrichments })
    .from(enrichments)
    .innerJoin(listings, eq(enrichments.listingId, listings.id))
    .where(isNull(enrichments.homesteadScore));

  console.log(`[backfill] ${rows.length} enrichment row(s) with null homestead_score`);

  let updated = 0;
  let failed = 0;
  for (const { listing, enrichment } of rows) {
    const { homesteadScore } = computeHomestead(listing, enrichment);
    if (homesteadScore == null) {
      failed += 1;
      console.warn(`[backfill] score compute returned null for listing ${listing.id} — left null`);
      continue;
    }
    await db
      .update(enrichments)
      .set({ homesteadScore })
      .where(eq(enrichments.listingId, listing.id));
    updated += 1;
  }

  console.log(`[backfill] done — updated ${updated}, left null ${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] fatal error:', err);
  process.exit(1);
});
```

Note: the script updates `enrichments` directly (rather than via `updateHomesteadScore`) because it already holds the `db` connection and needs no transaction; this mirrors the direct-query style of `seed-pipeline.ts`.

- [ ] **Step 3: Add the package.json script**

In `apps/server/package.json`, in the `"scripts"` block (next to `"seed:pipeline"`), add:

```json
    "backfill:homestead": "tsx scripts/backfill-homestead-score.ts"
```

- [ ] **Step 4: Typecheck the script**

Run:

```bash
rtk tsc -p apps/server/tsconfig.json --noEmit
```

Expected: PASS. Confirms `computeHomestead`'s exported signature accepts the queried `listings`/`enrichments` row shapes.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/server/src/services/listingService.ts apps/server/scripts/backfill-homestead-score.ts apps/server/package.json
rtk git commit -m "Add homestead_score backfill script (land-match-i1b)"
```

- [ ] **Step 6: Run the migration and backfill against the dev DB**

These are operational steps (run when ready to apply, not part of the commit):

```bash
pnpm --filter @landmatch/db db:migrate
pnpm --filter @landmatch/server backfill:homestead
```

Expected: migration applies the column; backfill logs `updated N, left null M`. Re-running the backfill should report `0 enrichment row(s) with null homestead_score`.

---

## Final verification

- [ ] Run the full server test suite:

```bash
pnpm --filter @landmatch/server test
```

Expected: PASS.

- [ ] Run lint:

```bash
pnpm --filter @landmatch/server lint
```

Expected: PASS.
