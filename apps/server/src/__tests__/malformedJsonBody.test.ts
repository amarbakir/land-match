import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { resetSharedRateLimitStore } from '../lib/sharedRateLimitStore';

// These posts hit the rate-limited /auth scope on a process-wide store —
// reset so this file cannot 429 based on test execution order.
beforeEach(() => {
  resetSharedRateLimitStore();
});

function post(app: ReturnType<typeof createApp>, body: string) {
  return app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('malformed JSON body handling', () => {
  // Bug this catches: without readJson a syntactically invalid body made
  // c.req.json() throw, falling through to onError as a 500 (wrong status, plus
  // attacker-triggerable Sentry noise). It must be a clean 400 instead.
  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await post(createApp(), '{not valid json');

    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; code: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe('BAD_REQUEST');
  });

  it('lets a well-formed body through to validation (400 from the schema, not the guard)', async () => {
    // Valid JSON but missing password → reaches the route and fails Zod validation.
    // Still a 400, but proves the guard did not block a syntactically valid body.
    const res = await post(createApp(), JSON.stringify({ email: 'user@example.com' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    // A schema message, not the guard's "Invalid JSON body"
    expect(json.error).not.toBe('Invalid JSON body');
  });
});
