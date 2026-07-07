# Shared API/Auth Client (`@landmatch/api-client`) — Design

**Bead:** land-match-cge.13
**Date:** 2026-07-07
**Status:** Approved

## Problem

`apps/frontend/src/api/client.ts` (126 lines) and `apps/extension/src/shared/api-client.ts` (128 lines) each hand-roll token storage access, deduplicated token refresh, and 401-retry — with drifted behavior:

- **Contract:** frontend throws `Error` and returns unwrapped `data`; extension never throws and returns a `{ok, data, code, error}` envelope.
- **Refresh failure:** frontend clears tokens and fires an `onAuthFailure` callback; extension clears auth only on a non-ok refresh response (stale tokens survive network errors) and has no callback.
- **Storage:** frontend stores two token keys (Expo SecureStore / localStorage); extension stores one `chrome.storage.local` object that also carries `email`.
- **Base URL:** frontend hardcodes `http://localhost:3000`; extension reads `VITE_API_BASE_URL`.

## Decision summary

1. Extract a shared client into a new package `packages/api-client` (`@landmatch/api-client`).
2. Exposed as a **factory**: `createApiClient({ baseUrl, storage, onAuthFailure })` — per-instance refresh state, no module globals.
3. Error contract: **throw a typed `ApiError`** (status, optional server `code`, message) and return unwrapped `data`. The extension keeps its envelope only as a thin catch-and-wrap at its chrome-messaging boundary.
4. Frontend base URL becomes `process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'`.

## Package: `@landmatch/api-client`

Located at `packages/api-client`, source-as-main (`main: ./src/index.ts`) like the other packages. Depends on `@landmatch/api` (workspace) for response types. Dev deps: typescript, vitest.

```ts
interface Tokens { accessToken: string; refreshToken: string }

interface TokenStorage {
  getTokens(): Promise<Tokens | null>;
  setTokens(tokens: Tokens): Promise<void>;
  clearTokens(): Promise<void>;
}

class ApiError extends Error {
  status: number;   // HTTP status
  code?: string;    // server error code from the Result envelope, if present
}

interface RequestOptions { noAuth?: boolean }

function createApiClient(options: {
  baseUrl: string;              // origin only, e.g. http://localhost:3000
  storage: TokenStorage;
  onAuthFailure?: () => void;   // fired after tokens are cleared on failed refresh
}): ApiClient;

interface ApiClient {
  get<TRes>(path: string, opts?: RequestOptions): Promise<TRes>;
  post<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<TRes>;
  patch<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<TRes>;
  put<TReq, TRes>(path: string, body: TReq, opts?: RequestOptions): Promise<TRes>;
  delete<TRes>(path: string, opts?: RequestOptions): Promise<TRes>;
}
```

The client prefixes `/api/v1` internally (it must know the API version for the refresh endpoint anyway). Callers pass unversioned paths: `/listings/enrich`, not `/api/v1/listings/enrich`.

## Unified behavior (frontend semantics as baseline)

- Attach `Authorization: Bearer <accessToken>` when tokens exist and `noAuth` is not set; set `Content-Type: application/json` only when a body is present.
- On 401 **with tokens present**: run a deduplicated refresh (single in-flight promise shared by concurrent requests) via `POST /api/v1/auth/refresh` with `{ refreshToken }`.
  - On success: persist via `storage.setTokens`, retry the original request once with the new access token.
  - On failure (non-ok response **or** network error): `storage.clearTokens()`, then `onAuthFailure?.()`. The original 401 response is what the caller sees (as an `ApiError`).
- Non-ok responses throw `ApiError` with the server's `error` message when parseable (fallback `Request failed (<status>)`) plus `status` and `code`.
- Success responses return `json.data` typed as `TRes`.

Behavior deltas for the extension (all acceptable): no refresh attempt when no tokens are stored; auth cleared on network-error refresh failures (previously stale tokens survived); no `Content-Type` header on GETs.

## Frontend integration

- `src/api/client.ts` shrinks to composition: a `TokenStorage` adapter over `tokenStorage.ts`, `createApiClient` with the env-based base URL, and re-exports of `apiGet`/`apiPost`/`apiPatch`/`apiPut`/`apiDelete` and `setOnAuthFailure` (mutable handler that the instance's `onAuthFailure` delegates to). Call sites keep their existing imports.
- `hooks.ts` / `AuthContext.tsx`: trim `/api/v1` from path literals; no structural changes.
- `tokenStorage.ts`: `setTokens` signature changes to take a `Tokens` object; otherwise unchanged.
- `src/api/__tests__/client.test.ts` is deleted in favor of the package suite.

## Extension integration

- `src/shared/auth.ts` keeps `StoredAuth` (with `email`) and its existing functions; gains a `TokenStorage` adapter whose `setTokens` merges new tokens over the stored `email`.
- `src/shared/api-client.ts` keeps its domain functions (`enrichListing`, `getListingByUrl`, `saveListing`, `login`) but each delegates to the shared client and catch-and-wraps `ApiError` into the existing `{ok, data, code, error}` envelope. `service-worker.ts` (untested, 186 lines) is untouched.
- `login` passes `noAuth: true`.

## Testing

- Port/adapt the frontend's `client.test.ts` into `packages/api-client/src/__tests__/` as the canonical suite, using a fake in-memory `TokenStorage` and mocked `fetch`: 401-retry with refreshed token, concurrent refresh dedup, clear-tokens + `onAuthFailure` on refresh failure (both non-ok and network error), `noAuth` skips Authorization, error-body parsing into `ApiError`, `/api/v1` prefixing.
- Extension envelope wrappers are thin enough to leave to the existing manual/smoke flow (extension has no test harness; standing one up is out of scope).

## Out of scope

- Any change to `service-worker.ts` or extension messaging contracts.
- Standing up an extension test harness.
- Server-side changes; the `/api/v1/auth/refresh` contract is unchanged.
