#!/bin/bash
# Runs lint and tests for affected packages before task completion.
# Used as a Stop hook — runs when Claude is about to finish.
# Exit 0 = allow completion, Exit 2 = block with feedback.

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Determine which packages have changes
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null; git diff --name-only HEAD~1 HEAD 2>/dev/null)

if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

FAILED=0
ERRORS=""

# Check each package area for changes and run its checks
if echo "$CHANGED_FILES" | grep -q "^apps/server/"; then
  echo "Running server lint..." >&2
  if ! pnpm --filter @landmatch/server lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Server lint failed"
  fi
  echo "Running server tests..." >&2
  if ! pnpm --filter @landmatch/server test:run 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Server tests failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^apps/frontend/"; then
  echo "Running frontend lint..." >&2
  if ! pnpm --filter @landmatch/frontend lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Frontend lint failed"
  fi
  echo "Running frontend tests..." >&2
  if ! pnpm --filter @landmatch/frontend test:run 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Frontend tests failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^packages/api/"; then
  echo "Running api lint..." >&2
  if ! pnpm --filter @landmatch/api lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- API package lint failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^packages/db/"; then
  echo "Running db lint..." >&2
  if ! pnpm --filter @landmatch/db lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- DB package lint failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^packages/config/"; then
  echo "Running config lint..." >&2
  if ! pnpm --filter @landmatch/config lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Config package lint failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^packages/enrichment/"; then
  echo "Running enrichment lint..." >&2
  if ! pnpm --filter @landmatch/enrichment lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Enrichment package lint failed"
  fi
fi

if echo "$CHANGED_FILES" | grep -q "^packages/scoring/"; then
  echo "Running scoring lint..." >&2
  if ! pnpm --filter @landmatch/scoring lint 2>&1; then
    FAILED=1
    ERRORS="$ERRORS\n- Scoring package lint failed"
  fi
fi

if [[ $FAILED -eq 1 ]]; then
  echo -e "QUALITY GATE FAILED. Fix these before completing:${ERRORS}" >&2
  exit 2
fi

echo "All quality gates passed." >&2
exit 0
