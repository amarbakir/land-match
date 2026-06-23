# Persist homesteadScore at enrichment time

**Bead:** land-match-i1b
**Date:** 2026-06-23

## Problem

`homesteadScore` is computed on the fly in `getSavedListings` for every item on
every request (`apps/server/src/services/listingService.ts`). The score is
deterministic given the listing (price, acreage, lat/lng) and its enrichment —
both immutable after insert — so recomputing per request is wasted work whose
cost grows with list size. Persist the score once at enrichment time and read it
back.

## Key facts

- Enrichment is 1:1 with a listing (`enrichments.listing_id` is `unique`).
- Listings are insert-once; their enrichment is insert-once. The inputs to the
  score never change after creation, so a stored score never goes stale.
- The score is computed with empty criteria `{}` and default weights — it is the
  default-profile homestead score, exactly what the saved-listings UI shows
  today.
- A canonical mapper already exists: `computeHomestead(listing, enrichment)` in
  `listingService.ts` (line ~12), used at enrich time via
  `toEnrichListingResponse`. It returns `{ homesteadScore, homesteadComponents }`
  and yields `null` on a scoring error. `getSavedListings` currently duplicates
  this logic inline against a partial row projection; this design converges the
  read path onto the persisted value with that inline compute kept only as a
  fallback.

## Design

### 1. Schema

Add one nullable column to the `enrichments` table
(`packages/db/src/schema.ts`):

```ts
homesteadScore: integer('homestead_score'),
```

- Integer — the composite score is `Math.round`'d (0–100).
- Nullable — distinguishes states: `null` = compute error or not-yet-backfilled;
  `0` = a valid score (e.g. hard-filtered listing). Readers must treat `0` as a
  real value, never falsy.

Generate a Drizzle migration (`pnpm --filter @landmatch/db db:generate`) using
the `drizzle-migrations` skill.

### 2. Write at enrich time

In `enrichAndPersist`'s existing transaction
(`listingService.ts`), after `insertEnrichment` returns the row:

1. Compute the score via the existing `computeHomestead(listing, enrichmentRow)`.
2. Persist with a new repo function
   `listingRepo.updateHomesteadScore(listingId, score, tx)`, run inside the same
   transaction.

Insert-then-update in one transaction (rather than threading the score into
`insertEnrichment`) keeps `insertEnrichment` unaware of listing data and reuses
the canonical mapper against the real persisted row. A listing therefore never
becomes visible with an unset-but-computable score. The score is stored as `null`
only when `computeHomestead` throws — identical to today's response behavior.

### 3. Read path

In `getSavedListings` / `findSavedListings`
(`listingRepo.ts`):

- Add `homesteadScore: enrichments.homesteadScore` to the `findSavedListings`
  select projection.
- In `getSavedListings`, use `row.homesteadScore` when non-null (`!= null`, so `0`
  counts); fall back to the existing inline compute when `null`.

The fallback guarantees the endpoint never returns `null` for a row whose score
is computable, covering pre-backfill rows and any row enriched before the column
existed.

### 4. Backfill script

`apps/server/scripts/backfill-homestead-score.ts`, wired as an
`apps/server/package.json` script (e.g. `backfill:homestead`), run once via
`tsx` (matching the existing `seed:pipeline` convention).

- Select enrichments joined to their listing where `homestead_score IS NULL`.
- Compute each via `computeHomestead` and update the column.
- Idempotent: only touches `null` rows, safe to re-run.
- Logs count processed vs. skipped (and any compute failures left as `null`).

### 5. Tests

Following `writing-meaningful-tests`:

- `getSavedListings` returns the **persisted** column value when set, and **falls
  back** to the computed value when the column is `null`. The two fixtures use
  *different* numbers so the assertion actually distinguishes "read the column"
  from "recomputed it."
- `getSavedListings` treats a persisted `0` as a valid score, not a fallback
  trigger.
- `enrichAndPersist` writes a non-null `homestead_score` for a normally-enriched
  listing.

## Out of scope (noted, not doing)

- **Moving homestead sorting into SQL.** Now that the column exists this is
  tempting (and would fix the current page-local sort, which only orders within
  the already-paginated page), but it is a separate concern from this latency
  bead and is complicated by fallback `null`s. The service-layer homestead sort
  is left as-is.
- **Recompute on re-enrichment.** Listings/enrichments are insert-once; there is
  no re-enrichment path to handle.
