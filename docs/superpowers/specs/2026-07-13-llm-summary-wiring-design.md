# Wire LLM match summaries (alert-worthy only) — Design

**Bead**: land-match-0jx.21
**Date**: 2026-07-13
**Status**: Approved (decision: wire, not delete)

## Problem

`generateSummary`/`llmClient` are dead code: zero callers, `scores.llm_summary`
always null, `@anthropic-ai/sdk` riding the Lambda bundle for nothing — while
`packages/scoring/src/summary.ts` interpolates attacker-controlled
`listingTitle`/`listingUrl` directly into the prompt (confirmed prompt-injection
surface, tcd.3 audit). The read path is already fully wired: repo → `MatchItem.llmSummary`
→ rendered in `VerdictSection`, `MatchRow`, `ShortlistView`, all null-safe.
Alert emails do not interpolate the summary.

Decision taken: wire it, with the injection surface hardened.

## Design

### Trigger: alert-worthy scores only

In `matchingService.matchListingAgainstProfiles`, after each profile's
score/alert transaction commits, generate a summary when ALL of:

- `features.enableLlmSummary` is on,
- the score did not fail hard filters,
- `overallScore >= profile.alertThreshold`,
- the score row's status is `inbox`,
- the per-user daily budget has headroom.

Rationale: bounded cost (no spend on below-threshold matches nobody may open),
and the summary exists by the time the alert email is delivered. Rescores
regenerate under the same gate, overwriting the now-stale summary.

### Failure isolation

Generation happens *outside* the score/alert transaction, awaited (not
fire-and-forget — Lambda freezes background work), in a try/catch:

- Success → best-effort `scoreRepo` update of `llm_summary` for that score row.
- LLM error, timeout, or budget denial → `llm_summary` stays null; matching
  still returns `ok`. The UI already renders null gracefully.

The LLM client stays dependency-injected (existing repo pattern) so
`matchingService` tests run without the SDK.

### Budget

Per-user daily cap via the existing `RateLimitStore` abstraction, using the
Postgres-backed store so the limit is shared across Lambda instances. Key
`llm-summary:<userId>`, 24 h window, limit from `LLM_SUMMARY_DAILY_LIMIT`
(default 25). Budget check precedes the API call; a denied check skips
generation silently.

### Prompt hardening (`packages/scoring/src/summary.ts`)

- Sanitize `listingTitle` and `listingUrl` in `buildPrompt`: strip control
  characters, collapse whitespace, cap title at 300 chars.
- Move both into a delimited untrusted block
  (`<listing-data>…</listing-data>`), with `<` and `>` stripped from the values
  so the fence cannot be closed from inside.
- Add an explicit instruction that content inside the block is data from the
  listing site and must never be treated as instructions.
- Output is treated as plain text everywhere (already true in the UI; keep it so).

### Client (`apps/server/src/lib/llm.ts`)

Explicit request `timeout` (15 s) and bounded `maxRetries` on the Anthropic
client. `max_tokens: 300` unchanged.

### Config (`apps/server/src/config.ts`)

- `features.enableLlmSummary = featureFlag('ENABLE_LLM_SUMMARY', false)` —
  default off, so the wiring ships inert until the flag and `ANTHROPIC_API_KEY`
  are set (the key lookup is already lazy).
- `llm.dailyLimit` from `LLM_SUMMARY_DAILY_LIMIT`, default 25.

## Testing

- `summary.ts`: injection payloads in title/URL stay inside the fenced block;
  title capped at 300 chars; `<`/`>` stripped so the fence can't be broken.
- `matchingService`: generates only at/above threshold; skipped when flag off;
  skipped when budget exhausted; LLM throw still returns `ok` with the score
  and alerts written; rescore overwrites an existing summary.

## Out of scope

- No new DB migration (`llm_summary` column exists).
- No summary in alert email bodies.
- No on-demand/lazy generation endpoint.
