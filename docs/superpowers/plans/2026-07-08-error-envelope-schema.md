# Zod Error-Envelope Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server's response envelopes (`{ok:true, data}` / `{ok:false, code, error}`) canonical Zod schemas in `@landmatch/api`, validate them at runtime in `@landmatch/api-client`, and pin the server to them at compile time.

**Architecture:** Two small Zod schemas added to the existing contract file `packages/api/src/result.ts`. The shared client replaces its ad-hoc `JSON.parse` + cast handling with `safeParse` at three points (error parsing, success unwrapping, refresh payload). The server's `jsonError`/`okResponse` literals get `satisfies` guards — compile-time only.

**Tech Stack:** Zod 4, TypeScript 5.9, Vitest 4, pnpm workspaces. No new dependencies (zod is already a dep of `@landmatch/api`; `@landmatch/api-client` already depends on `@landmatch/api` — this change makes that a runtime dependency, pulling Zod into the frontend and extension bundles for the first time, which the spec accepts).

**Spec:** `docs/superpowers/specs/2026-07-08-error-envelope-schema-design.md` (read it before starting).

## Global Constraints

- Use `pnpm`, never npm/yarn. Prefix shell commands with `rtk` (e.g. `rtk git commit ...`, `rtk pnpm ...`).
- Commit messages: simple, prefixed `land-match-2zc: `. NEVER add a "Co-Authored-By" line or mention Claude/AI.
- Do NOT close bead `land-match-2zc` — the user decides when.
- Accepted behavior changes (from the spec — do not "fix" them): non-contract error bodies now yield the generic `Request failed (<status>)` message; 2xx responses with malformed JSON or a non-contract wrapper now throw `ApiError('Malformed response body')`.
- The existing 15 tests in `packages/api-client/src/__tests__/client.test.ts` must pass UNCHANGED — they already use contract-shaped bodies. If one fails, the implementation is wrong, not the test.
- No server runtime behavior changes; `satisfies` guards only.

---

### Task 1: Envelope schemas in `@landmatch/api`

**Files:**
- Modify: `packages/api/src/result.ts` (currently 18 lines: `Result<T>` type + `ok`/`err` helpers, no imports)
- Modify: `packages/api/src/index.ts` (the `./result` export line)
- Test: `packages/api/src/__tests__/envelope.test.ts` (new file)

**Interfaces:**
- Consumes: `zod` (already a dependency of `@landmatch/api`).
- Produces (later tasks rely on these exact exports from `@landmatch/api`):
  - `ApiErrorEnvelope`: Zod schema for `{ ok: false; code?: string; error: string }`
  - `ApiSuccessEnvelope`: Zod schema for `{ ok: true; data?: unknown }`
  - `ApiErrorEnvelopeType`, `ApiSuccessEnvelopeType`: their `z.infer` types

- [ ] **Step 1: Write the failing schema tests**

Create `packages/api/src/__tests__/envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ApiErrorEnvelope, ApiSuccessEnvelope } from '../result';

describe('ApiErrorEnvelope', () => {
  it('accepts the canonical server error shape', () => {
    const parsed = ApiErrorEnvelope.safeParse({
      ok: false,
      code: 'NOT_FOUND',
      error: 'Resource not found',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a missing code', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: false, error: 'boom' }).success).toBe(true);
  });

  it('rejects ok: true', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: true, error: 'boom' }).success).toBe(false);
  });

  it('rejects a non-string error field', () => {
    expect(
      ApiErrorEnvelope.safeParse({ ok: false, error: { message: 'boom' } }).success,
    ).toBe(false);
  });

  it('rejects a body with no error field', () => {
    expect(ApiErrorEnvelope.safeParse({ ok: false, message: 'boom' }).success).toBe(false);
  });
});

describe('ApiSuccessEnvelope', () => {
  it('accepts the canonical server success shape', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: true, data: { id: '1' } }).success).toBe(true);
  });

  it('accepts an absent data key', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: true }).success).toBe(true);
  });

  it('rejects ok: false', () => {
    expect(ApiSuccessEnvelope.safeParse({ ok: false, data: {} }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk pnpm --filter @landmatch/api test:run`
Expected: FAIL — `envelope.test.ts` cannot import `ApiErrorEnvelope` (not exported). Existing api-package tests still pass.

- [ ] **Step 3: Add the schemas**

In `packages/api/src/result.ts`, add at the top of the file:

```ts
import { z } from 'zod';
```

And append at the end of the file:

```ts
/**
 * HTTP error envelope produced by the server for every non-2xx response
 * (see apps/server/src/lib/httpExceptions.ts). The server always sends
 * `code`; it stays optional here so clients tolerate its absence rather
 * than discarding the error message.
 */
export const ApiErrorEnvelope = z.object({
  ok: z.literal(false),
  code: z.string().optional(),
  error: z.string(),
});
export type ApiErrorEnvelopeType = z.infer<typeof ApiErrorEnvelope>;

/**
 * HTTP success envelope. Only the wrapper is validated — per-endpoint
 * payloads remain typed by client generics.
 */
export const ApiSuccessEnvelope = z.object({
  ok: z.literal(true),
  data: z.unknown().optional(),
});
export type ApiSuccessEnvelopeType = z.infer<typeof ApiSuccessEnvelope>;
```

In `packages/api/src/index.ts`, replace the line:

```ts
export { err, ok, type Result } from './result';
```

with:

```ts
export {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  err,
  ok,
  type ApiErrorEnvelopeType,
  type ApiSuccessEnvelopeType,
  type Result,
} from './result';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk pnpm --filter @landmatch/api test:run`
Expected: PASS — 8 new envelope tests plus all pre-existing api tests.

Run: `rtk pnpm --filter @landmatch/api lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/api
rtk git commit -m "land-match-2zc: add ApiErrorEnvelope/ApiSuccessEnvelope schemas to @landmatch/api"
```

---

### Task 2: Validate envelopes in `@landmatch/api-client`

**Files:**
- Modify: `packages/api-client/src/client.ts`
- Test: `packages/api-client/src/__tests__/client.test.ts` (append 4 tests; the existing 15 must pass unchanged)

**Interfaces:**
- Consumes: `ApiErrorEnvelope`, `ApiSuccessEnvelope` from Task 1; `AuthTokenResponse` (existing Zod schema in `@landmatch/api`: `{ accessToken: string; refreshToken: string; expiresIn: number }`); existing test helpers `makeStorage`, `jsonResponse`, `mockFetch`, `BASE_URL` at the top of the test file.
- Produces: no interface changes — `ApiError`, `createApiClient`, and all method signatures stay identical. Behavior deltas per the spec: non-contract error bodies → generic message; malformed 2xx bodies → `ApiError('Malformed response body', status)`.

- [ ] **Step 1: Append the failing tests**

In `packages/api-client/src/__tests__/client.test.ts`, append inside the `request basics` describe block (after the 204 test):

```ts
  // Bug guard: 2xx with a garbage body previously escaped as a raw SyntaxError
  it('throws ApiError for a 200 response with a non-JSON body', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }));

    const err = await client.get('/items').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Malformed response body');
    expect((err as ApiError).status).toBe(200);
  });

  it('throws ApiError for a 200 response without the success envelope', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    await expect(client.get('/items')).rejects.toThrow('Malformed response body');
  });

  // Schema guard: a non-string error field can no longer become the ApiError message
  it('falls back to the generic message when the error field is not a string', async () => {
    const storage = makeStorage(null);
    const client = createApiClient({ baseUrl: BASE_URL, storage });
    mockFetch.mockResolvedValueOnce(jsonResponse(400, { ok: false, error: { detail: 'bad' } }));

    await expect(client.get('/items')).rejects.toThrow('Request failed (400)');
  });
```

And append inside the `401 refresh flow` describe block (after the dedup test):

```ts
  // Schema guard: refresh 200 with a valid envelope but invalid token payload
  it('treats a refresh payload failing schema validation as a failed refresh', async () => {
    const storage = makeStorage({ accessToken: 'expired', refreshToken: 'refresh-1' });
    const onAuthFailure = vi.fn();
    const client = createApiClient({ baseUrl: BASE_URL, storage, onAuthFailure });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'expired' }))
      // Valid success envelope, but payload lacks expiresIn → AuthTokenResponse rejects
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, data: { accessToken: 'fresh', refreshToken: 'refresh-2' } }),
      );

    await expect(client.get('/items')).rejects.toThrow('expired');

    expect(storage.setTokens).not.toHaveBeenCalled();
    expect(storage.clearTokens).toHaveBeenCalled();
    expect(onAuthFailure).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: the 15 existing tests PASS. New failures: "non-JSON body" fails (raw `SyntaxError`, not `ApiError`); "without the success envelope" fails (resolves `undefined` instead of rejecting); "error field is not a string" fails (message is the stringified object, not the generic fallback); "refresh payload failing schema validation" fails (`setTokens` WAS called — the current code only checks field truthiness, and both token fields are present).

- [ ] **Step 3: Implement the validation**

In `packages/api-client/src/client.ts`:

1. Replace the import line at the top:

```ts
import type { AuthTokenResponseType } from '@landmatch/api';
```

with:

```ts
import { ApiErrorEnvelope, ApiSuccessEnvelope, AuthTokenResponse } from '@landmatch/api';
```

2. Replace the whole `parseApiError` function:

```ts
function parseApiError(text: string, status: number): ApiError {
  try {
    const parsed = ApiErrorEnvelope.safeParse(JSON.parse(text));
    if (parsed.success) return new ApiError(parsed.data.error, status, parsed.data.code);
  } catch {
    // non-JSON error body
  }
  return new ApiError(`Request failed (${status})`, status);
}
```

3. In `tryRefresh`, replace this block:

```ts
        const json = (await response.json()) as { data: AuthTokenResponseType };
        const data = json.data;
        // A malformed body (data null/missing fields) throws here and is
        // caught below — treated as a failed refresh.
        const next = { accessToken: data.accessToken, refreshToken: data.refreshToken };
        if (!next.accessToken || !next.refreshToken) return null;
        await storage.setTokens(next);
        return next;
```

with:

```ts
        const envelope = ApiSuccessEnvelope.safeParse(await response.json());
        if (!envelope.success) return null;
        const parsed = AuthTokenResponse.safeParse(envelope.data.data);
        if (!parsed.success) return null;

        const next = { accessToken: parsed.data.accessToken, refreshToken: parsed.data.refreshToken };
        await storage.setTokens(next);
        return next;
```

(A non-JSON refresh body makes `response.json()` throw — still handled by the surrounding `catch { return null }`.)

4. In `request`, replace the success tail:

```ts
    const json = (await response.json()) as { data: TRes };
    return json.data;
```

with:

```ts
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('Malformed response body', response.status);
    }
    const envelope = ApiSuccessEnvelope.safeParse(json);
    if (!envelope.success) {
      throw new ApiError('Malformed response body', response.status);
    }
    return envelope.data.data as TRes;
```

- [ ] **Step 4: Run the full package suite and lint**

Run: `rtk pnpm --filter @landmatch/api-client test:run`
Expected: PASS — 19 tests (15 existing unchanged + 4 new).

Run: `rtk pnpm --filter @landmatch/api-client lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/api-client
rtk git commit -m "land-match-2zc: validate response envelopes with Zod in api client"
```

---

### Task 3: Server `satisfies` guards + full-repo verification

**Files:**
- Modify: `apps/server/src/lib/httpExceptions.ts` (functions `jsonError` and `okResponse`)

**Interfaces:**
- Consumes: `ApiErrorEnvelopeType`, `ApiSuccessEnvelopeType` (type-only) from Task 1.
- Produces: no runtime change — identical response bytes; drift between server envelopes and the schemas becomes a compile error.

- [ ] **Step 1: Add the satisfies guards**

In `apps/server/src/lib/httpExceptions.ts`:

1. Extend the existing import:

```ts
import { type ErrorCodeType, ErrorMessage } from '@landmatch/api';
```

to:

```ts
import {
  type ApiErrorEnvelopeType,
  type ApiSuccessEnvelopeType,
  type ErrorCodeType,
  ErrorMessage,
} from '@landmatch/api';
```

2. Replace `jsonError`:

```ts
function jsonError(status: number, code: string, message: string) {
  const body = { ok: false, code, error: message } satisfies ApiErrorEnvelopeType;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

3. Replace `okResponse`:

```ts
/** Returns a successful JSON response. Default status 200; pass 201 for created. */
export function okResponse<T>(c: Context<Env>, data: T, status?: 200 | 201) {
  const body = { ok: true, data } satisfies ApiSuccessEnvelopeType;
  return c.json(body, status ?? 200);
}
```

- [ ] **Step 2: Verify the guards catch drift (throwaway check)**

Temporarily rename the `error` key in `jsonError`'s body literal to `message`. Run `rtk pnpm --filter @landmatch/server lint` and confirm tsc REPORTS an error on the `satisfies` line. Revert the rename immediately. (This is the "failing test" for a compile-time guard.)

- [ ] **Step 3: Run server lint and tests**

Run: `rtk pnpm --filter @landmatch/server lint`
Expected: clean.

Run: `rtk pnpm --filter @landmatch/server test:run`
Expected: all 168 server tests pass (response bytes unchanged).

- [ ] **Step 4: Full-repo verification**

Run: `rtk pnpm lint`
Expected: every package clean.

Run: `rtk pnpm -r test:run`
Expected: all suites green (api +8, api-client 19, frontend 71, server 168, others unchanged). Also run `rtk pnpm --filter @landmatch/extension test` (its script is `test`, not `test:run`).

Run: `rtk pnpm build`
Expected: succeeds. In the extension's vite output, note the emitted chunk sizes in your report — Zod now enters the extension bundle for the first time; a service-worker/sidepanel chunk growing by roughly 10–60 KB raw is expected, flag anything wildly larger.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/server
rtk git commit -m "land-match-2zc: pin server envelopes to schema with satisfies guards"
```

Do NOT close the bead — report completion and let the user decide.
