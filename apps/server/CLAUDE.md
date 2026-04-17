# Server (apps/server/)

## Layering — strict separation

1. **Routes** (`src/routes/`) — HTTP only. Extract params/body, call service, return JSON. Use `throwFromResult()` to convert service errors to HTTP exceptions.
2. **Services** (`src/services/`) — Business logic orchestration. Coordinate repos + domain functions. Wrap in try-catch, return `Result<T>`. Use `ok(data)` / `err(error)` from
   `lib/result.ts`.
3. **Repos** (`src/repos/`) — Drizzle queries only. Return domain types or `null` — not Result (services handle errors). Use `$inferSelect`/`$inferInsert` for type safety.
4. **Domain** — Pure functions imported by services. Never import DB or server code into domain.

## Response format

All endpoints return `{ ok: true, data }` or `{ ok: false, code, error }`.

## Database conventions

- IDs: TEXT (UUID), generated via `lib/id.ts`
- Timestamps: `timestamp with timezone` (Drizzle mode `'date'`) — stored as PostgreSQL timestamps, returned as JS `Date` objects
- Column names: snake_case in schema
- Repos accept optional `Tx` param for transactions; services use `db.transaction()` to wrap multi-repo calls

## Request handling

- Validate via Zod schemas from `@landmatch/api` — no ad-hoc shape checks
- `requireAuth` / `optionalAuth` middleware set `userId` on context

## File organization

- One file per resource (e.g., `userRepo.ts`, `userService.ts`, `users.ts` route)
- Namespace imports for services: `import * as userService from "../services/userService"`
