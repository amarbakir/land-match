#!/bin/bash
# Blocks edits to sensitive/protected files.
# Used as a PreToolUse hook for Edit and Write tools.
# Exit 0 = allow, Exit 2 = block (reason on stderr).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path (e.g. Bash tool calls)
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Protected file patterns
PROTECTED_FILES=(
  "CLAUDE.md"
  "AGENTS.md"
  ".claude/settings.json"
  ".claude/settings.local.json"
  ".claude/hooks/"
  "pnpm-lock.yaml"
)

# Sensitive file patterns (env vars, secrets)
SENSITIVE_PATTERNS=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.development"
  ".env.staging"
  "credentials"
  "secrets"
  ".secret"
)

for pattern in "${PROTECTED_FILES[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "{\"decision\": \"block\", \"reason\": \"BLOCKED: $FILE_PATH is a protected file. Ask the user before modifying.\"}"
    exit 0
  fi
done

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "{\"decision\": \"block\", \"reason\": \"BLOCKED: $FILE_PATH appears to contain sensitive data (env vars/secrets). Ask the user before modifying.\"}"
    exit 0
  fi
done

exit 0
