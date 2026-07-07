# Shared API/Auth Client (`@landmatch/api-client`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated token-storage/401-retry/refresh logic from `apps/frontend/src/api/client.ts` and `apps/extension/src/shared/api-client.ts` into a new shared package `@landmatch/api-client`, with both apps consuming one implementation.

**Architecture:** A factory `createApiClient({ baseUrl, storage, onAuthFailure })` with an injected `TokenStorage` interface. The client prefixes `/api/v1` internally, throws a typed `ApiError` on failure, and returns unwrapped `json.data` on success. The frontend adapts its SecureStore/localStorage token module to `TokenStorage`; the extension adapts its `chrome.storage.local` auth module (which also carries `email`) and keeps its `{ok, data, code, error}` envelope only as a thin catch-and-wrap at the chrome-messaging boundary.

**Tech Stack:** TypeScript 5.9, Vitest 4, pnpm workspaces. No new external dependencies.

**Spec:** `docs/superpowers/specs/2026-07-07-shared-api-client-design.md` (read it before starting).

## Global Constraints

- Use `pnpm`, never npm/yarn. Prefix shell commands with `rtk` (e.g. `rtk git commit ...`, `rtk vitest ...`).
- Commit messages: simple, prefixed `land-match-cge.13: `. NEVER add a "Co-Authored-By" line or mention Claude.
- Do NOT close bead `land-match-cge.13` — the user decides when to close it.
- New package follows the repo pattern: source-as-main (`"main": "./src/index.ts"`), no build step.
- No raw SQL, no new abstractions beyond what tasks specify. Delete dead code instead of commenting it out.
- The server error envelope is `{ ok: false, code, error }` (see `apps/server/src/lib/httpExceptions.ts:17`); success envelope is `{ ok: true, data }` (`packages/api/src/result.ts`).

---

### Task 1: Scaffold `@landmatch/api-client` with core request/error behavior

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/src/client.ts`
- Create: `packages/api-client/src/index.ts`
- Test: `packages/api-client/src/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `AuthTokenResponseType` from `@landmatch/api` (type-only).
- Produces (later tasks rely on these exact exports from `@landmatch/api-client`):
  - `interface Tokens { accessToken: string; refreshToken: string }`
  - `interface TokenStorage { getTokens(): Promise<Tokens | null>; setTokens(tokens: Tokens): Promise<void>; clearTokens(): Promise<void> }`
  - `interface RequestOptions { noAuth?: boolean }`
  - `class ApiError extends Error { readonly status: number; readonly code?: string }`
  - `function createApiClient(options: { baseUrl: string; storage: TokenStorage; onAuthFailure?: () => void }): ApiClient`
  - `interface ApiClient` with `get<TRes>(path, options?)`, `post<TReq, TRes>(path, body, options?)`, `patch<TReq, TRes>(path, body, options?)`, `put<TReq, TRes>(path, body, options?)`, `delete<TRes>(path, options?)` — all return `Promise<TRes>`.

- [ ] **Step 1: Create the package manifest and tsconfig**

`packages/api-client/package.json`:

```json
{
  "name": "@landmatch/api-client",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit && eslint src/",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@landmatch/api": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vitest": "^4.0.16"
  }
}
```

`packages/api-client/tsconfig.json` (mirrors `packages/api/tsconfig.json`):

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

Then run: `rtk pnpm install`
Expected: lockfile updates, `@landmatch/api-client` linked into the workspace.

- [ ] **Step 2: Write the failing tests for core request behavior**

Create `packages/api-client/src/__tests__/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient, type TokenStorage, type Tokens } from '../client';

const BASE_URL = 'http://api.test';

function makeStorage(initial: Tokens | null) {
  let tokens = initial;
  return {
    getTokens: vi.fn(async () => tokens),
    setTokens: vi.fn(async (next: Tokens) => {
      tokens = next;
    }),
    clearTokens: vi.fn(async () => {
      tokens = null;
    }),
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request basics', () => {
  it('prefixes /api/v1 and returns unwrapped data', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { items: [1, 2] } }));

    const result = await client.get<{ items: number[] }>('/listings/saved');

    expect(mockFetch.mock.calls[0][0]).toBe('http://api.test/api/v1/listings/saved');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('attaches Authorization header when tokens exist', async () => {
    const storage = makeStorage({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.get('/items');

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer acc-1');
  });

  // Bug guard: noAuth requests leaking the bearer token to public endpoints
  it('noAuth requests do not include Authorization header and skip storage', async () => {
    const storage = makeStorage({ accessToken: 'secret', refreshToken: 'ref-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.post('/auth/login', { email: 'a@b.com', password: 'pw' }, { noAuth: true });

    const headers = new Headers(mockFetch.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(storage.getTokens).not.toHaveBeenCalled();
  });

  it('sets Content-Type only when a body is present', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: {} }));

    await client.get('/items');
    await client.post('/items', { a: 1 });

    const getHeaders = new Headers(mockFetch.mock.calls[0][1]?.headers);
    const postHeaders = new Headers(mockFetch.mock.calls[1][1]?.headers);
    expect(getHeaders.get('Content-Type')).toBeNull();
    expect(postHeaders.get('Content-Type')).toBe('application/json');
    expect(mockFetch.mock.calls[1][1]?.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws ApiError carrying server message, status, and code', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(
      jsonResponse(409, { ok: false, code: 'EMAIL_ALREADY_EXISTS', error: 'An account with this email already exists' }),
    );

    const err = await client.post('/auth/register', { email: 'a@b.com' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('An account with this email already exists');
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('EMAIL_ALREADY_EXISTS');
  });

  // Bug guard: 200-with-garbage or proxy error pages crashing the parser
  it('handles non-JSON error body gracefully', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    await expect(client.get('/items')).rejects.toThrow('Request failed (502)');
  });

  it('falls back to status-based message when JSON has no error field', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'bad' }));

    await expect(client.post('/items', {})).rejects.toThrow('Request failed (400)');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: FAIL — `Cannot find module '../client'` (or equivalent resolution error).

- [ ] **Step 4: Implement the core client (no refresh logic yet)**

Create `packages/api-client/src/client.ts`:

```ts
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStorage {
  getTokens(): Promise<Tokens | null>;
  setTokens(tokens: Tokens): Promise<void>;
  clearTokens(): Promise<void>;
}

export interface RequestOptions {
  noAuth?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  onAuthFailure?: () => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClient {
  get<TRes>(path: string, options?: RequestOptions): Promise<TRes>;
  post<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  patch<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  put<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  delete<TRes>(path: string, options?: RequestOptions): Promise<TRes>;
}

function parseApiError(text: string, status: number): ApiError {
  try {
    const parsed = JSON.parse(text);
    if (parsed.error) return new ApiError(parsed.error, status, parsed.code);
  } catch {
    // non-JSON error body
  }
  return new ApiError(`Request failed (${status})`, status);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { storage } = options;
  const apiBase = `${options.baseUrl}/api/v1`;

  async function authFetch(path: string, init: RequestInit): Promise<Response> {
    const tokens = await storage.getTokens();
    const headers = new Headers(init.headers);
    if (tokens) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }

    return fetch(`${apiBase}${path}`, { ...init, headers });
  }

  async function request<TRes>(
    method: string,
    path: string,
    body?: unknown,
    reqOptions?: RequestOptions,
  ): Promise<TRes> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const response = reqOptions?.noAuth
      ? await fetch(`${apiBase}${path}`, init)
      : await authFetch(path, init);

    if (!response.ok) {
      throw parseApiError(await response.text(), response.status);
    }

    const json = await response.json();
    return json.data as TRes;
  }

  return {
    get: <TRes>(path: string, o?: RequestOptions) => request<TRes>('GET', path, undefined, o),
    post: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('POST', path, body, o),
    patch: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('PATCH', path, body, o),
    put: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('PUT', path, body, o),
    delete: <TRes>(path: string, o?: RequestOptions) => request<TRes>('DELETE', path, undefined, o),
  };
}
```

Create `packages/api-client/src/index.ts`:

```ts
export {
  ApiError,
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type RequestOptions,
  type TokenStorage,
  type Tokens,
} from './client';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: PASS — 7 tests.

- [ ] **Step 6: Lint the new package**

Run: `rtk pnpm --filter @landmatch/api-client lint`
Expected: clean (tsc + eslint, no errors).

- [ ] **Step 7: Commit**

```bash
rtk git add packages/api-client pnpm-lock.yaml
rtk git commit -m "land-match-cge.13: scaffold @landmatch/api-client with core request handling"
```

---

### Task 2: Add 401 refresh/retry behavior to the shared client

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/__tests__/client.test.ts` (append a describe block)

**Interfaces:**
- Consumes: everything from Task 1; `AuthTokenResponseType` from `@landmatch/api` (`{ accessToken: string; refreshToken: string; expiresIn: number }`).
- Produces: final unified 401 semantics — refresh only when tokens were present, deduplicated in-flight refresh, retry-once with new token, `storage.clearTokens()` + `onAuthFailure?.()` when refresh fails for ANY reason (non-ok response, network error, malformed body). Refresh endpoint: `POST {baseUrl}/api/v1/auth/refresh` with body `{ refreshToken }`.

- [ ] **Step 1: Append the failing auth-flow tests**

Append to `packages/api-client/src/__tests__/client.test.ts` (after the `request basics` describe block; reuses `makeStorage`, `jsonResponse`, `mockFetch`, `BASE_URL` from the top of the file):

```ts
describe('401 refresh flow', () => {
  // Bug guard: retry using the stale token → silent 401 loop
  it('retries with the NEW token after refresh, not the stale one', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { items: [] } }));

    await client.get('/items');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toBe('http://api.test/api/v1/auth/refresh');
    const retryHeaders = new Headers(mockFetch.mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
    expect(storage.setTokens).toHaveBeenCalledWith({
      accessToken: 'fresh',
      refreshToken: 'refresh-2',
    });
  });

  // Bug guard: failed refresh leaving the user stuck with dead tokens
  it('clears tokens and fires onAuthFailure when refresh returns non-ok', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Refresh token expired' }));

    await expect(client.get('/items')).rejects.toThrow('Token expired');

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });

  // New unified behavior: extension previously kept stale tokens on network errors
  it('clears tokens and fires onAuthFailure when refresh throws (network error)', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Token expired' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(client.get('/items')).rejects.toThrow('Token expired');

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });

  // Bug guard: refresh 200 with garbage data → TypeError crash or infinite loop
  it('treats malformed refresh response as failure and clears tokens', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: null }));

    await expect(client.get('/items')).rejects.toThrow();

    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2); // original 401 + refresh, no loop
  });

  // Bug guard: unauthenticated 401 triggering a pointless refresh
  it('does not attempt refresh when no tokens are stored', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Auth required' }));

    await expect(client.get('/items')).rejects.toThrow('Auth required');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(storage.clearTokens).not.toHaveBeenCalled();
  });

  // Bug guard: 403 accidentally triggering refresh → wasted token rotation
  it('does not attempt refresh on 403 Forbidden', async () => {
    const storage = makeStorage({ accessToken: 'valid', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: 'Forbidden' }));

    await expect(client.get('/admin')).rejects.toThrow('Forbidden');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Bug guard: concurrent 401s each rotating the refresh token → race
  it('deduplicates concurrent refresh attempts', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    let refreshCallCount = 0;

    mockFetch.mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return jsonResponse(200, {
          ok: true,
          data: { accessToken: 'fresh', refreshToken: 'refresh-2', expiresIn: 3600 },
        });
      }
      return jsonResponse(200, { ok: true, data: { items: [] } });
    });
    // First fetch of each concurrent request returns 401
    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }));

    await Promise.all([client.get('/items'), client.get('/users')]);

    expect(refreshCallCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: the 7 Task 1 tests PASS; the new `401 refresh flow` tests FAIL (no refresh is attempted, so retry/clear/dedup assertions fail). Exception: "does not attempt refresh when no tokens are stored" and "does not attempt refresh on 403" may already pass — that is fine, they are regression guards.

- [ ] **Step 3: Add refresh logic to the client**

In `packages/api-client/src/client.ts`, add this type-only import at the top of the file:

```ts
import type { AuthTokenResponseType } from '@landmatch/api';
```

Then replace the body of `createApiClient` so it reads (only `authFetch` changes plus the new `tryRefresh` and destructured `onAuthFailure`; `request` and the returned object stay exactly as in Task 1):

```ts
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { storage, onAuthFailure } = options;
  const apiBase = `${options.baseUrl}/api/v1`;

  let refreshPromise: Promise<Tokens | null> | null = null;

  function tryRefresh(): Promise<Tokens | null> {
    // Deduplicate concurrent refresh attempts
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const tokens = await storage.getTokens();
        if (!tokens) return null;

        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!response.ok) return null;

        const json = await response.json();
        const data = json.data as AuthTokenResponseType;
        // A malformed body (data null/missing fields) throws here and is
        // caught below — treated as a failed refresh.
        const next = { accessToken: data.accessToken, refreshToken: data.refreshToken };
        if (!next.accessToken || !next.refreshToken) return null;
        await storage.setTokens(next);
        return next;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response> {
    const tokens = await storage.getTokens();
    const headers = new Headers(init.headers);
    if (tokens) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }

    let response = await fetch(`${apiBase}${path}`, { ...init, headers });

    if (response.status === 401 && tokens) {
      const newTokens = await tryRefresh();
      if (newTokens) {
        headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
        response = await fetch(`${apiBase}${path}`, { ...init, headers });
      } else {
        await storage.clearTokens();
        onAuthFailure?.();
      }
    }

    return response;
  }

  // Leave the `request` function and the returned { get, post, patch, put,
  // delete } object exactly as they already exist in this file — only
  // `tryRefresh`, the 401 branch in `authFetch`, and the destructured
  // `onAuthFailure` are new.
}
```

- [ ] **Step 4: Run the full package suite**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: PASS — 14 tests.

Run: `rtk pnpm --filter @landmatch/api-client lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/api-client
rtk git commit -m "land-match-cge.13: add 401 refresh/retry with dedup to shared api client"
```

---

### Task 3: Migrate the frontend to `@landmatch/api-client`

**Files:**
- Modify: `apps/frontend/package.json` (add dependency)
- Modify: `apps/frontend/vitest.config.ts` (add alias)
- Modify: `apps/frontend/src/auth/tokenStorage.ts` (`setTokens` takes a `Tokens` object)
- Modify: `apps/frontend/src/api/client.ts` (rewrite as thin composition)
- Modify: `apps/frontend/src/auth/AuthContext.tsx` (paths + `setTokens` call)
- Modify: `apps/frontend/src/api/hooks.ts` (trim `/api/v1` from path literals)
- Modify: `apps/frontend/src/auth/__tests__/auth-navigation.test.ts` (new signature + paths)
- Delete: `apps/frontend/src/api/__tests__/client.test.ts` (superseded by the package suite)

**Interfaces:**
- Consumes: `createApiClient`, `ApiError`, `RequestOptions`, `TokenStorage`, `Tokens` from `@landmatch/api-client` (signatures in Task 1).
- Produces: `apps/frontend/src/api/client.ts` keeps exporting `apiGet<TRes>(path, options?)`, `apiPost<TReq, TRes>(path, body, options?)`, `apiPatch<TReq, TRes>(path, body, options?)`, `apiPut<TReq, TRes>(path, body, options?)`, `apiDelete<TRes>(path, options?)`, `setOnAuthFailure(cb: () => void)` — same names as today, but paths passed by callers are now UNVERSIONED (`/auth/login`, not `/api/v1/auth/login`). `tokenStorage.ts` exports `setTokens(tokens: Tokens): Promise<void>` (object arg).

- [ ] **Step 1: Add the workspace dependency and vitest alias**

In `apps/frontend/package.json` `dependencies`, add (keep alphabetical order):

```json
"@landmatch/api-client": "workspace:*",
```

In `apps/frontend/vitest.config.ts`, add to `resolve.alias` (next to the existing `@landmatch/api` alias):

```ts
'@landmatch/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
```

Run: `rtk pnpm install`
Expected: link added, no errors.

- [ ] **Step 2: Change `setTokens` to take a `Tokens` object**

In `apps/frontend/src/auth/tokenStorage.ts`, replace the `setTokens` function:

```ts
export async function setTokens(tokens: Tokens): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    return;
  }

  const SecureStore = await getSecureStore();
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}
```

Everything else in the file (including the local `Tokens` interface, which structurally matches the package's) stays unchanged.

- [ ] **Step 3: Rewrite the frontend client as a thin composition**

Replace the ENTIRE contents of `apps/frontend/src/api/client.ts` with:

```ts
import {
  createApiClient,
  type RequestOptions,
  type TokenStorage,
} from '@landmatch/api-client';

import { clearTokens, getTokens, setTokens } from '../auth/tokenStorage';

const storage: TokenStorage = { getTokens, setTokens, clearTokens };

let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: () => void) {
  onAuthFailure = callback;
}

const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  storage,
  onAuthFailure: () => onAuthFailure?.(),
});

export function apiGet<TRes>(path: string, options?: RequestOptions) {
  return client.get<TRes>(path, options);
}

export function apiPost<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.post<TReq, TRes>(path, body, options);
}

export function apiPatch<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.patch<TReq, TRes>(path, body, options);
}

export function apiPut<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.put<TReq, TRes>(path, body, options);
}

export function apiDelete<TRes>(path: string, options?: RequestOptions) {
  return client.delete<TRes>(path, options);
}
```

- [ ] **Step 4: Update AuthContext paths and setTokens call**

In `apps/frontend/src/auth/AuthContext.tsx`:

In `login` (currently `apps/frontend/src/auth/AuthContext.tsx:46-54`), change the path and the `setTokens` call:

```ts
  const login = useCallback(async (data: LoginRequestType) => {
    const result = await apiPost<LoginRequestType, AuthTokenResponseType>(
      '/auth/login',
      data,
      { noAuth: true },
    );
    await setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setIsAuthenticated(true);
  }, []);
```

In `register` (currently lines 56-62), change `'/api/v1/auth/register'` to `'/auth/register'`.

- [ ] **Step 5: Trim `/api/v1` from every path literal in hooks.ts**

In `apps/frontend/src/api/hooks.ts`, remove the `/api/v1` prefix from all 12 path occurrences (template literals included):

| Line (current) | Old | New |
|---|---|---|
| 23 | `'/api/v1/listings/enrich'` | `'/listings/enrich'` |
| 32 | `'/api/v1/search-profiles'` | `'/search-profiles'` |
| 39 | `'/api/v1/search-profiles/counts'` | `'/search-profiles/counts'` |
| 63 | `` `/api/v1/search-profiles/${profileId}/matches${...}` `` | `` `/search-profiles/${profileId}/matches${...}` `` |
| 75 | `` `/api/v1/scores/${scoreId}` `` | `` `/scores/${scoreId}` `` |
| 86 | `'/api/v1/search-profiles'` | `'/search-profiles'` |
| 106 | `` `/api/v1/search-profiles/${id}` `` | `` `/search-profiles/${id}` `` |
| 121 | `` `/api/v1/search-profiles/${id}` `` | `` `/search-profiles/${id}` `` |
| 139 | `` `/api/v1/scores/${scoreId}` `` | `` `/scores/${scoreId}` `` |
| 153 | `'/api/v1/users/me/notification-preferences'` | `'/users/me/notification-preferences'` |
| 163 | `'/api/v1/users/me/notification-preferences'` | `'/users/me/notification-preferences'` |
| 189 | `` `/api/v1/listings/saved${...}` `` | `` `/listings/saved${...}` `` |
| 202 | `` `/api/v1/listings/${listingId}/save` `` | `` `/listings/${listingId}/save` `` |

- [ ] **Step 6: Delete the superseded client test and update the auth-navigation test**

Delete `apps/frontend/src/api/__tests__/client.test.ts` (its behaviors are covered by `packages/api-client/src/__tests__/client.test.ts` from Tasks 1-2).

In `apps/frontend/src/auth/__tests__/auth-navigation.test.ts`, the test mirrors AuthContext flows, so update it to match:

1. In `registerFlow` (line 37): `'/api/v1/auth/register'` → `'/auth/register'`.
2. In `loginFlow` (lines 46-47):

```ts
async function loginFlow(data: { email: string; password: string }) {
  const result = await apiPost('/auth/login', data, { noAuth: true });
  await setTokens({
    accessToken: (result as { accessToken: string }).accessToken,
    refreshToken: (result as { refreshToken: string }).refreshToken,
  });
}
```

3. The register assertion (lines 72-76): expected path becomes `'/auth/register'`.
4. The login assertion (line 116) becomes:

```ts
expect(mockSetTokens).toHaveBeenCalledWith({
  accessToken: 'my-access-token',
  refreshToken: 'my-refresh-token',
});
```

After both edits, verify no versioned paths remain anywhere in the frontend source:

Run: `rtk grep -rn "/api/v1" /Users/amarbakir/dev/land-match/apps/frontend/src`
Expected: no matches.

- [ ] **Step 7: Run frontend tests and typecheck**

Run: `rtk pnpm --filter @landmatch/frontend test:run`
Expected: PASS (auth-navigation suite; the old client suite is gone).

Run: `rtk pnpm --filter @landmatch/frontend lint`
Expected: clean tsc.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/frontend pnpm-lock.yaml
rtk git commit -m "land-match-cge.13: migrate frontend to @landmatch/api-client"
```

---

### Task 4: Migrate the extension to `@landmatch/api-client`

**Files:**
- Modify: `apps/extension/package.json` (add dependency)
- Modify: `apps/extension/src/shared/auth.ts` (add `tokenStorage` adapter, delete `getAccessToken`)
- Modify: `apps/extension/src/shared/api-client.ts` (rewrite: shared client + envelope wrappers)
- Modify: `apps/extension/src/shared/config.ts` (delete now-unused `API_V1`)
- NOT modified: `apps/extension/src/background/service-worker.ts` — its envelope contract is preserved exactly.

**Interfaces:**
- Consumes: `ApiError`, `createApiClient`, `TokenStorage`, `Tokens` from `@landmatch/api-client`; `API_BASE_URL` from `./config`; `getAuth`/`setAuth`/`clearAuth` from `./auth`.
- Produces: `api-client.ts` keeps exporting `enrichListing(payload)`, `getListingByUrl(url)`, `saveListing(listingId)`, `login(email, password)` — all returning `Promise<ApiResponse<T>>` with the existing `{ok, data?, code?, error?}` shape, so `service-worker.ts` needs zero changes. `auth.ts` additionally exports `tokenStorage: TokenStorage`.

- [ ] **Step 1: Add the workspace dependency**

In `apps/extension/package.json` `dependencies`, add (keep alphabetical order):

```json
"@landmatch/api-client": "workspace:*",
```

Run: `rtk pnpm install`
Expected: link added, no errors.

- [ ] **Step 2: Add the TokenStorage adapter to auth.ts and delete dead code**

In `apps/extension/src/shared/auth.ts`:

1. Delete the `getAccessToken` function (lines 22-25) — after this task nothing imports it (verified in Step 5).
2. Append the adapter. The `setTokens` merge preserves the stored `email` (the extension keeps email alongside tokens for its auth-status UI):

```ts
import type { TokenStorage, Tokens } from '@landmatch/api-client';

export const tokenStorage: TokenStorage = {
  async getTokens(): Promise<Tokens | null> {
    const auth = await getAuth();
    if (!auth) return null;
    return { accessToken: auth.accessToken, refreshToken: auth.refreshToken };
  },
  async setTokens(tokens: Tokens): Promise<void> {
    const existing = await getAuth();
    await setAuth({ ...tokens, email: existing?.email ?? '' });
  },
  async clearTokens(): Promise<void> {
    await clearAuth();
  },
};
```

(The `import type` line goes at the top of the file.)

- [ ] **Step 3: Rewrite api-client.ts as envelope wrappers over the shared client**

Replace the ENTIRE contents of `apps/extension/src/shared/api-client.ts` with:

```ts
import type { EnrichListingResponse, SaveListingResponse } from '@landmatch/api';
import { ApiError, createApiClient } from '@landmatch/api-client';

import { tokenStorage } from './auth';
import { API_BASE_URL } from './config';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
}

const client = createApiClient({ baseUrl: API_BASE_URL, storage: tokenStorage });

// The service worker forwards results over chrome messaging, where thrown
// errors do not serialize — so wrap the shared client's throw-based contract
// back into the {ok, data, code, error} envelope at this boundary.
async function toEnvelope<T>(promise: Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function enrichListing(payload: {
  address: string;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
  source?: string;
  externalId?: string;
}) {
  return toEnvelope(
    client.post<typeof payload, EnrichListingResponse>('/listings/enrich', payload),
  );
}

export function getListingByUrl(url: string) {
  return toEnvelope(
    client.get<EnrichListingResponse>(`/listings/by-url?url=${encodeURIComponent(url)}`),
  );
}

export function saveListing(listingId: string) {
  return toEnvelope(
    client.post<undefined, SaveListingResponse>(`/listings/${listingId}/save`, undefined),
  );
}

export function login(email: string, password: string) {
  return toEnvelope(
    client.post<
      { email: string; password: string },
      { accessToken: string; refreshToken: string }
    >('/auth/login', { email, password }, { noAuth: true }),
  );
}
```

- [ ] **Step 4: Remove the now-unused API_V1 export**

In `apps/extension/src/shared/config.ts`, delete the line:

```ts
export const API_V1 = `${API_BASE_URL}/api/v1`;
```

(`API_BASE_URL`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES` stay.)

- [ ] **Step 5: Verify no stragglers, then typecheck and build**

Run: `rtk grep -rn "API_V1\|getAccessToken" /Users/amarbakir/dev/land-match/apps/extension/src`
Expected: no matches.

Run: `rtk pnpm --filter @landmatch/extension lint`
Expected: clean tsc.

Run: `rtk pnpm --filter @landmatch/extension build`
Expected: vite build succeeds for both targets.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/extension pnpm-lock.yaml
rtk git commit -m "land-match-cge.13: migrate extension to @landmatch/api-client"
```

---

### Task 5: Full-repo verification

**Files:**
- No new files; runs repo-wide checks.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: green build/lint/test across the workspace.

- [ ] **Step 1: Lint everything**

Run: `rtk pnpm lint`
Expected: every package clean.

- [ ] **Step 2: Run all unit tests**

Run: `rtk pnpm -r test:run`
Expected: `@landmatch/api-client` 14 tests pass, frontend auth-navigation passes, all other suites unchanged and green.

- [ ] **Step 3: Build everything**

Run: `rtk pnpm build`
Expected: succeeds (extension vite build, server tsc, etc.).

- [ ] **Step 4: Runtime smoke check (frontend through metro)**

`@landmatch/api-client` is the first workspace package the frontend imports at RUNTIME (previous `@landmatch/api` imports were type-only), so verify metro resolves it: start `rtk pnpm dev`, open the web app, and confirm the login screen loads and a login attempt sends `POST http://localhost:3000/api/v1/auth/login` (check the server log or network tab — a 401 from bad credentials is fine, a bundler resolution error is not). Stop the dev server afterwards.

If metro cannot resolve the package, the fix is NOT to inline the code back — report the resolution error and stop for guidance.

- [ ] **Step 5: Final commit if anything moved**

```bash
rtk git status
```

If clean, done. If verification required tweaks, commit them:

```bash
rtk git add -A
rtk git commit -m "land-match-cge.13: verification fixes for shared api client"
```

Do NOT close the bead — report completion and let the user decide.
