---
name: verify
description: Launch and drive the LandMatch API server locally to verify server-side changes end-to-end
---

# Verifying apps/server changes

## Launch

```bash
cd apps/server
PORT=3123 pnpm dev        # tsx watch src/index.ts; ready in ~2-3s
```

- Dev config needs no .env: `DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:5432/landmatch`, JWT secret has a dev default (`src/config.ts`).
- Postgres runs in Docker; the instance published on `localhost:5432` holds both `landmatch` and `landmatch_test` databases (user/pass `postgres`/`postgres`). `pg_isready` without `-h localhost` checks the Unix socket and misleadingly reports "no response" — use TCP.
- Default `PORT` is 3000; pick a spare (e.g. 3123) to avoid a running dev server.

## Drive

All routes live under `/api/v1/...`; responses are `{ ok: true, data }` or `{ ok: false, code, error }`.

```bash
curl -s -X POST http://localhost:3123/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify-<ts>@example.com","password":"hunter2hunter2","name":"Verify"}'
curl -s -X POST http://localhost:3123/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
```

Inspect state directly when useful:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d landmatch -Atc "SELECT ..."
```

## Cleanup

Delete any rows you created (e.g. `refresh_tokens` for the user, then `users`) and stop the dev server.
