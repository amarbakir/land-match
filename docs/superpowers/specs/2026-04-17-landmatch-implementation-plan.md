# LandMatch — Implementation Plan

## Context

The founder is actively searching for rural land and wants a personal tool that enriches listings with agricultural viability data (soil, flood, zoning, climate risk), scores them against search criteria, and sends alerts. The tool is architected for multi-user from day one with a path to commercialization. Two deliverables: a reusable template repo extracted from compair patterns, then LandMatch scaffolded from it.

Full design spec: `docs/superpowers/specs/2026-04-17-landmatch-design.md`

## Deliverable 1: Template Repo

Create a new repo (`project-template` or similar) that extracts compair's proven patterns into a reusable monorepo starter.

### What to extract from compair (`/Users/amarbakir/dev/compair/`)

**Structure & Config:**
- pnpm workspace config (`pnpm-workspace.yaml` — `apps/*`, `packages/*`)
- `package.json` with workspace scripts, `onlyBuiltDependencies`, security overrides
- `.nvmrc` (Node 20), `.npmrc` (node-linker=hoisted)
- `tsconfig.json` (base config)
- ESLint flat config (`eslint.config.js`)
- Prettier config (`.prettierrc` — 140 width, single quotes, import sorting)
- `.prettierignore`, `.gitignore`
- VS Code settings (`.vscode/settings.json` — file nesting)
- `docker-compose.yml` — Postgres 16 template

**Server boilerplate (`apps/server/`):**
- Hono app factory pattern (`src/app.ts`)
- Layered architecture stubs: routes/, services/, repos/
- `src/lib/result.ts` — Result<T> type
- `src/lib/httpExceptions.ts` — throwFromResult pattern
- `src/db/client.ts` — Drizzle client + Tx type
- `src/config.ts` — env config + featureFlag helper
- Health route
- Vitest configs (unit + integration)
- Integration test safety guard (DB name must end in `_test`)
- `src/index.ts` (Node server) + `src/lambda.ts` (Lambda adapter)

**Shared packages:**
- `packages/api/` — Zod schema pattern, error codes enum, shared types
- `packages/db/` — Drizzle schema stub + migration config
- `packages/config/` — shared config utilities

**Frontend boilerplate (`apps/frontend/`):**
- Expo + React Native Web setup
- Expo Router with typed routes
- Tamagui config (design tokens, theme)
- React Query provider setup
- `src/api/client.ts` — fetchApi with auth token injection
- Auth context stub

**Infrastructure:**
- `sst.config.ts` — SST v4 template (Lambda dev, Fargate prod, secrets pattern)
- `infra/scripts/` — deploy script stubs

**AI Config:**
- Root `CLAUDE.md` — project description template, tech stack, conventions, beads workflow
- Root `AGENTS.md` — autonomy policy, protected files, worktree workflow, quality gates, commit format
- `apps/server/CLAUDE.md` — layer separation rules
- `apps/frontend/CLAUDE.md` — UI/component rules
- `.claude/` directory setup

**Beads:**
- `.beads/` directory structure

### Steps

1. Create the template repo with the directory structure
2. Extract and generalize each config file (replace `compair` references with template placeholders)
3. Set up the server boilerplate with layered architecture stubs
4. Set up the frontend boilerplate with Expo + RNW + Tamagui
5. Set up shared packages (api, db, config)
6. Add SST config template
7. Add AI config files (CLAUDE.md hierarchy, AGENTS.md)
8. Verify: `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm test` all pass
9. Commit

## Deliverable 2: LandMatch (Phase 1 — Scaffold)

Scaffold LandMatch from the template, then customize for the land search domain.

### Steps

1. Copy/fork template into land-match repo
2. Rename all `@template/*` references to `@landmatch/*`
3. Customize CLAUDE.md with LandMatch domain context (enrichment pipeline, data sources, scoring)
4. Customize AGENTS.md
5. Set up DB schema: users, search_profiles, listings, enrichments, scores, alerts tables
6. Generate initial Drizzle migration
7. Set up docker-compose and verify DB connectivity
8. Add auth routes (register, login, refresh) — adapted from compair patterns
9. Add health route
10. Set up Expo web shell with auth flow
11. Initialize beads project
12. Verify: server starts, frontend loads, auth works, DB migrates
13. Commit

## Deliverable 2: LandMatch (Phase 2 — Single-Listing Enrichment)

The thin vertical slice: paste an address → get an enriched property report.

### Steps

1. **Geocode adapter** (`packages/enrichment/src/geocode.ts`)
   - Census Geocoder API client
   - Input: address string → Output: Result<{lat, lng, standardizedAddress}>
   - Fallback: Nominatim

2. **Soil adapter** (`packages/enrichment/src/soil.ts`)
   - USDA Soil Data Access API client
   - Input: LatLng → Output: Result<SoilData>
   - Handle SOAP/SQL query language

3. **Flood adapter** (`packages/enrichment/src/flood.ts`)
   - FEMA NFHL ArcGIS REST client
   - Input: LatLng → Output: Result<FloodData>
   - Handle Zone D (undetermined)

4. **Pipeline orchestrator** (`packages/enrichment/src/pipeline.ts`)
   - Runs available adapters in parallel via Promise.allSettled
   - Assembles partial results
   - Feature flag checks via isAvailable()

5. **Scoring engine** (`packages/scoring/src/`)
   - Component score functions (soil, flood, price, acreage, geography)
   - Weighted overall score calculator
   - Hard filter logic (short-circuit to 0)
   - LLM summary generator (Claude Haiku via Anthropic SDK)

6. **Server routes + services**
   - `POST /api/listings/enrich` — accept address or URL, geocode, enrich, score, return report
   - `GET /api/listings/:id` — get listing with enrichment + score
   - Listing service orchestrates: create listing → geocode → enrich → score → persist
   - Enrichment repo: save/retrieve enrichment data

7. **Frontend: Property Report view**
   - Input form: paste address or listing URL
   - Report display: enrichment data, component scores, overall score, LLM summary
   - Loading states for each enrichment stage

8. **Tests**
   - Unit tests for each adapter (mock HTTP responses)
   - Unit tests for scoring functions (pure, no mocks needed)
   - Integration test: address → full enrichment → score

### Verification

- Start server: `pnpm --filter server dev`
- Start frontend: `pnpm --filter frontend dev`
- Paste a real address (e.g., a known rural property in Hudson Valley)
- Verify: geocode succeeds, soil data returns, flood zone returns, score calculates, LLM summary generates
- Check DB: listing, enrichment, and score records persisted
- Run tests: `pnpm test`
- Run lint: `pnpm lint`
- Run build: `pnpm build`

### Key files from compair to reference

| Pattern | Compair file | Purpose |
|---------|-------------|---------|
| Result type | `/apps/server/src/lib/result.ts` | ok/err pattern |
| HTTP exceptions | `/apps/server/src/lib/httpExceptions.ts` | throwFromResult |
| DB client + Tx | `/apps/server/src/db/client.ts` | Drizzle setup |
| Config + feature flags | `/apps/server/src/config.ts` | featureFlag() helper |
| Route pattern | `/apps/server/src/routes/` | Hono route structure |
| Service pattern | `/apps/server/src/services/` | Service layer |
| Repo pattern | `/apps/server/src/repos/` | Data access layer |
| API schemas | `/packages/api/src/` | Zod contract pattern |
| DB schema | `/packages/db/src/schema.ts` | Drizzle schema |
| API client | `/apps/mobile/src/api/client.ts` | fetchApi pattern |
| React Query hooks | `/apps/mobile/src/hooks/` | Query/mutation hooks |
| Vitest integration | `/apps/server/vitest.integration.config.ts` | Integration test config |
| SST config | `/sst.config.ts` | Infrastructure template |
| Root CLAUDE.md | `/CLAUDE.md` | AI config pattern |
| AGENTS.md | `/AGENTS.md` | Agent behavior rules |
