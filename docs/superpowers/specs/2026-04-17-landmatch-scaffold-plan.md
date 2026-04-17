# LandMatch — Scaffold from Template (Phase 1)

## Context

Template repo is complete at `/Users/amarbakir/dev/project-template/`. LandMatch needs to be scaffolded from it in `/Users/amarbakir/dev/land-match/`, then customized for the land search domain. This covers Phase 1 of the implementation plan.

Full design spec: `docs/superpowers/specs/2026-04-17-landmatch-design.md`

## Prerequisites

- Template repo at `/Users/amarbakir/dev/project-template/` (2 commits, lint + build passing)
- LandMatch directory already exists at `/Users/amarbakir/dev/land-match/` (has docs/ from brainstorming)

## Step 1: Copy Template into LandMatch

Copy all template files into land-match, preserving existing docs/.

```bash
# From template, copy everything except .git/
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.sst' --exclude='dist' \
  /Users/amarbakir/dev/project-template/ /Users/amarbakir/dev/land-match/
```

## Step 2: Rename @template → @landmatch

Find and replace all `@template/` references to `@landmatch/` and `template` to `landmatch` in:

| File | What to change |
|------|---------------|
| `package.json` | name: `"landmatch"`, script filter names |
| `apps/server/package.json` | name: `"@landmatch/server"`, dependency names |
| `apps/server/tsconfig.json` | paths: `@landmatch/db` |
| `apps/server/src/lib/errors.ts` | import from `@landmatch/api` |
| `apps/server/src/lib/httpExceptions.ts` | import from `@landmatch/api` |
| `apps/server/src/db/client.ts` | import from `@landmatch/db` |
| `apps/server/src/config.ts` | default DATABASE_URL db name |
| `apps/server/vitest.config.ts` | alias `@landmatch/db` |
| `apps/server/vitest.integration.config.ts` | alias `@landmatch/db` |
| `packages/api/package.json` | name: `"@landmatch/api"` |
| `packages/db/package.json` | name: `"@landmatch/db"` |
| `packages/db/drizzle.config.ts` | default db name |
| `packages/config/package.json` | name: `"@landmatch/config"` |
| `tsconfig.json` | paths: `@landmatch/db` |
| `.prettierrc` | importOrder: `@landmatch/` |
| `docker-compose.yml` | container_name, POSTGRES_DB |
| `sst.config.ts` | app name, resource names |
| `CLAUDE.md` | all references |
| `apps/server/CLAUDE.md` | all references |
| `.claude/hooks/quality-gate.sh` | filter names |

## Step 3: Add LandMatch-Specific Packages

Create two new packages that don't exist in the template:

### packages/enrichment/
```
packages/enrichment/
├── package.json        — name: @landmatch/enrichment
├── tsconfig.json
└── src/
    ├── index.ts        — export all adapters + pipeline
    ├── types.ts        — LatLng, EnrichmentAdapter<T>, EnrichmentResult, SoilData, FloodData, ParcelData, ClimateData
    ├── geocode.ts      — Census Geocoder adapter (stub)
    ├── soil.ts         — USDA Soil Data Access adapter (stub)
    ├── flood.ts        — FEMA NFHL adapter (stub)
    ├── parcel.ts       — Regrid adapter (stub, feature-flagged)
    ├── climate.ts      — First Street adapter (stub, feature-flagged)
    └── pipeline.ts     — orchestrator: runs available adapters in parallel
```

### packages/scoring/
```
packages/scoring/
├── package.json        — name: @landmatch/scoring
├── tsconfig.json
└── src/
    ├── index.ts        — export scoring functions
    ├── types.ts        — ComponentScores, ScoringWeights, ScoringResult
    ├── components.ts   — individual score functions (soil, flood, price, acreage, zoning, geography, infrastructure, climate)
    ├── scorer.ts       — weighted overall score + hard filter logic
    └── summary.ts      — LLM summary generator (stub)
```

## Step 4: Set Up DB Schema

Create the full Drizzle schema in `packages/db/src/schema.ts`:

Tables: users, search_profiles, listings, enrichments, scores, alerts

See design spec for full column definitions. Key conventions:
- TEXT UUID ids
- `timestamp with timezone` mode `'date'`
- snake_case columns
- jsonb for criteria, component_scores, raw_data, soil_suitability_ratings, parcel_geometry, notification_prefs

Export all tables from `packages/db/src/index.ts`.

## Step 5: Add Server Dependencies

Add to `apps/server/package.json`:
- `@landmatch/enrichment`: `workspace:*`
- `@landmatch/scoring`: `workspace:*`
- `@anthropic-ai/sdk` (for LLM summaries)
- `resend` (for email alerts)

## Step 6: Customize CLAUDE.md

Update root `CLAUDE.md` with:
- Project description (LandMatch — intelligent property search for back-to-land buyers)
- Updated monorepo map (add enrichment, scoring packages)
- Domain-specific patterns (enrichment pipeline, adapter interface, scoring engine)
- Data sources (USDA, FEMA, Regrid, First Street)

## Step 7: Update AGENTS.md

Add LandMatch-specific scopes to commit conventions:
- Scopes: `frontend`, `server`, `enrichment`, `scoring`, `api`, `db`, `config`

## Step 8: Generate Initial Migration

```bash
cd packages/db && pnpm db:generate
```

## Step 9: Initialize Git + Beads

```bash
cd /Users/amarbakir/dev/land-match
git init
git add -A
git commit -m "Scaffold LandMatch from project-template"
```

Initialize beads if `bd` is available.

## Step 10: Verify

1. `pnpm install` — succeeds
2. `pnpm lint` — all packages pass
3. `pnpm build` — all packages build
4. `docker-compose up -d` — Postgres starts
5. Server starts: `pnpm dev:server` — health endpoint responds
6. DB migration runs on startup

## Key Files to Reference

| Pattern | Template file |
|---------|--------------|
| Result type | `apps/server/src/lib/result.ts` |
| HTTP exceptions | `apps/server/src/lib/httpExceptions.ts` |
| DB client + Tx | `apps/server/src/db/client.ts` |
| Config + feature flags | `apps/server/src/config.ts` |
| Error codes | `packages/api/src/errors.ts` |
| SST config | `sst.config.ts` |
| Quality gate hook | `.claude/hooks/quality-gate.sh` |
