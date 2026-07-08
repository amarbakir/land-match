# Zod Error-Envelope Schema (`@landmatch/api` → `@landmatch/api-client`) — Design

**Bead:** land-match-2zc
**Date:** 2026-07-08
**Status:** Approved

## Problem

Follow-up from the land-match-cge.13 final review. The server's response envelopes — `{ ok: true, data }` (success, `httpExceptions.ts` `okResponse`) and `{ ok: false, code, error }` (error, `jsonError`) — have no Zod schema in `@landmatch/api`. Consequently:

- `packages/api-client/src/client.ts` `parseApiError` does ad-hoc `JSON.parse` + untyped property access: a non-string `error` field becomes a garbage `ApiError` message.
- The success path casts `(await response.json()) as { data: TRes }`: a 2xx response with malformed JSON throws a raw `SyntaxError` instead of an `ApiError` (accepted-Minor in the cge.13 review).
- `tryRefresh` validates the refresh payload by casting and relying on property access to throw.
- Nothing ties the server's hand-built envelope literals to any contract.

## Decision summary

1. Define `ApiErrorEnvelope` and `ApiSuccessEnvelope` Zod schemas in `packages/api/src/result.ts` (the existing envelope-contract file), re-exported from the package index.
2. `@landmatch/api-client` consumes them at runtime (`safeParse`). This makes `@landmatch/api` a runtime dependency of the client — **Zod enters the frontend and extension bundles for the first time** (accepted; Zod 4 core, roughly 10–15 KB gzip).
3. The error schema is **strict about `ok: false`** — non-contract error bodies (e.g. a proxy's bare `{error: "..."}`) fall back to the generic `Request failed (<status>)` message instead of being surfaced. Accepted behavior change: only contract-shaped messages reach users.
4. The server gets compile-time `satisfies` guards tying its envelope literals to the schemas. No server runtime change.

## Schemas

In `packages/api/src/result.ts` (file already owns the `Result<T>` contract; gains a `zod` import — the package already depends on zod):

```ts
export const ApiErrorEnvelope = z.object({
  ok: z.literal(false),
  code: z.string().optional(), // server always sends it; client tolerates absence
  error: z.string(),
});
export type ApiErrorEnvelopeType = z.infer<typeof ApiErrorEnvelope>;

export const ApiSuccessEnvelope = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});
export type ApiSuccessEnvelopeType = z.infer<typeof ApiSuccessEnvelope>;
```

Both schemas and types are re-exported from `packages/api/src/index.ts`.

Notes:
- `code` stays optional in the schema even though `jsonError` always sends it — client-side tolerance beats losing the error message over a missing code.
- `data: z.unknown()` accepts an absent `data` key (parses to `undefined`), matching the previous `json.data` behavior for envelope-less success wrappers. Per-endpoint payloads remain typed by the client's generics, not validated — this schema only checks the wrapper.

## Client consumption (`packages/api-client/src/client.ts`)

- **`parseApiError(text, status)`**: `JSON.parse` inside the existing try/catch, then `ApiErrorEnvelope.safeParse`. On success → `new ApiError(parsed.data.error, status, parsed.data.code)`. On any failure (non-JSON, non-matching shape, non-string `error`) → `new ApiError('Request failed (<status>)', status)`.
- **Success path in `request<TRes>()`**: after the existing `!response.ok` throw and 204 guard, wrap `response.json()` in try/catch and `ApiSuccessEnvelope.safeParse` the result. Either failure throws `new ApiError('Malformed response body', response.status)`. On success return `parsed.data.data as TRes`.
- **`tryRefresh()`**: replace the cast + property-access-throws trick with explicit validation: `ApiSuccessEnvelope.safeParse(json)`, then `AuthTokenResponse.safeParse(envelope.data.data)` (schema already exists in `@landmatch/api`, includes `expiresIn`). Any mismatch → `return null` → existing clear-tokens + `onAuthFailure` path. The manual `if (!next.accessToken || !next.refreshToken)` check and the "malformed body throws" comment are deleted — the schema does that job now.
- The type-only `import type { AuthTokenResponseType }` becomes a value import of `ApiErrorEnvelope`, `ApiSuccessEnvelope`, `AuthTokenResponse`.

## Server compile-time guards (`apps/server/src/lib/httpExceptions.ts`)

- `jsonError`: build the payload as a named literal with `satisfies ApiErrorEnvelopeType` before `JSON.stringify`.
- `okResponse`: the `{ ok: true, data }` literal gets `satisfies ApiSuccessEnvelopeType`.

Drift between server envelopes and the schemas becomes a type error. No runtime behavior change.

## Behavior changes (all accepted)

1. Error bodies not matching `{ok: false, error: string}` no longer surface their message; users see `Request failed (<status>)`. (Previously any JSON with a truthy `error` key was surfaced.)
2. 2xx responses with malformed JSON or a non-contract wrapper now throw `ApiError('Malformed response body')` instead of a raw `SyntaxError` (or silently returning `undefined` for a missing wrapper).
3. None for refresh: invalid payloads already resulted in a failed refresh; the mechanism is just explicit now.

## Testing

- `packages/api-client` (~4 new tests alongside the existing 15, which need no changes — they already use contract-shaped bodies):
  1. 200 with non-JSON body → rejects with `ApiError` `'Malformed response body'`.
  2. 200 with JSON lacking the `{ok: true}` wrapper → same.
  3. Error response whose `error` field is not a string → falls back to `Request failed (<status>)`.
  4. Refresh 200 with a valid envelope but invalid token payload (e.g. missing `expiresIn`) → treated as failed refresh: tokens cleared, `onAuthFailure` fired.
- `packages/api`: one small test file for the two schemas — accepts the canonical server shapes; rejects `ok` mismatches, non-string `error`.
- Repo-wide verification: lint, all unit tests, `pnpm build`; note the extension `vite build` output size delta to eyeball the Zod cost.

## Out of scope

- Per-endpoint response payload validation (payloads stay generics-typed).
- Any change to server runtime behavior or response shapes.
- Request-body validation changes (server already uses safeParse per route).
