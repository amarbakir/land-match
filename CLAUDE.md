# CLAUDE.md

Concise onboarding for any Claude session in this repo. For autonomous agent rules, see `AGENTS.md`.

## Project

LandMatch — intelligent property search tool for back-to-land buyers (homesteaders, small farmers, off-grid seekers). Enriches rural land listings with USDA soil quality, FEMA flood zones, parcel zoning, and climate risk data, then scores and alerts users when matching properties appear.

## Tech stack

- **Frontend**: Expo + React Native Web, Expo Router, Tamagui, React Query, TypeScript
- **Server**: Hono 4 on Node/TypeScript, Zod validation
- **Shared**: `@landmatch/api` (Zod schemas/types), `@landmatch/db` (Drizzle ORM), `@landmatch/config`, `@landmatch/enrichment` (data source adapters), `@landmatch/scoring` (scoring engine)
- **Tooling**: pnpm workspaces, TypeScript 5.9, ESLint 9, Vitest, Drizzle Kit

## Monorepo map

| Path                  | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `apps/frontend/`      | Expo app — file-based routes, UI components, API client                                  |
| `apps/server/`        | Hono API — routes in `src/routes/`, services in `src/services/`, repos in `src/repos/`   |
| `packages/api/`       | Zod schemas — single source of truth for API contracts                                   |
| `packages/db/`        | Drizzle schema (`src/schema.ts`) + migrations (`drizzle/`) + drizzle config              |
| `packages/config/`    | Shared config utilities                                                                  |
| `packages/enrichment/`| Data source adapters: soil (USDA), flood (FEMA), parcel (Regrid), climate (First Street) |
| `packages/scoring/`   | Deterministic scoring engine + LLM summary generation                                    |
| `docs/`               | Design specs, implementation plans                                                       |
| `infra/`              | Deploy scripts, SST helpers                                                              |

## Commands (from repo root)

```
pnpm dev                                # API + frontend
pnpm dev:server / pnpm dev:frontend     # individual
pnpm build / pnpm lint                  # all packages
pnpm --filter <pkg> test                # unit tests (vitest)
pnpm --filter @landmatch/server test:integration  # integration tests
pnpm --filter @landmatch/db db:generate / db:migrate  # DB migrations
```

## Key patterns

- **API versioning**: all routes under `/api/v1/...` (`apps/server/src/app.ts`)
- **Return types**: `Result<T>` from `@landmatch/api` (`packages/api/src/result.ts`)
- **Validation**: Zod schemas from `@landmatch/api` — no ad-hoc shape checks
- **DB**: snake_case columns, TEXT UUID ids, repos accept optional `Tx` for transactions
- **Config/env**: `apps/server/src/config.ts` — missing critical envs throw in production
- **Enrichment pipeline**: adapters implement `EnrichmentAdapter<T>`, orchestrated in parallel via `pipeline.ts`
- **Scoring engine**: deterministic component scores (0-100) + weighted average, hard filters for pass/fail
- **LLM integration**: dependency-injected `generateText` function — adapter in `apps/server/src/lib/llm.ts`, testable without SDK
- **Data sources**: USDA Soil Data Access (free), FEMA NFHL (free), Regrid (feature-flagged), First Street (feature-flagged)

## Conventions

- Use `pnpm`, not npm/yarn
- Run `bd ready` to check for tracked work before starting features
- Consult `docs/superpowers/specs/` for designs and `docs/superpowers/plans/` for implementation plans
- Announce a short plan before multi-step changes
- Keep scope tight — no speculative abstractions, no unused helpers
- Delete dead code instead of commenting it out
- Change `@landmatch/api` schemas first when altering API contracts
- DB schema changes require generated Drizzle migration
- Security: use Drizzle query builders (no raw SQL), validate CORS settings, watch for XSS
- Track all tasks/bugs/features with `bd` (beads) — never use markdown TODOs or other trackers
- Use simple commit messages and never write "Co-Authored-By: Claude ..." in commit messages

## Beads workflow

- `bd ready` — check for assigned/unblocked work before starting
- `bd show <id>` — read context before implementing
- `bd create "title" -d "description"` — title is positional, `-t` is type not title
- `bd close <id> -m "<commit hash>. <what was done>"` — close after committing
- `bd update <id> -d "..."` — update description (`-d`), `--title` for title, `-s` for status
- When a plan covers multiple beads, close each one individually after its commit
- If a bead is deferred or descoped, add a comment (`bd comments <id> add "..."`) explaining why
