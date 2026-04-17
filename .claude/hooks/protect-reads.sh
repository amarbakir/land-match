#!/bin/bash
# Blocks reads of sensitive env/secret files.
# Used as a PreToolUse hook for Read, Grep, and Glob tools.
# Exit 0 = allow, Exit 2 = block (reason on stderr).

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Collect paths to check based on the tool
PATHS_TO_CHECK=()
case "$TOOL_NAME" in
  Read)
    PATHS_TO_CHECK+=($(echo "$INPUT" | jq -r '.tool_input.file_path // empty'))
    ;;
  Grep)
    PATHS_TO_CHECK+=($(echo "$INPUT" | jq -r '.tool_input.path // empty'))
    ;;
  Glob)
    PATHS_TO_CHECK+=($(echo "$INPUT" | jq -r '.tool_input.path // empty'))
    PATHS_TO_CHECK+=($(echo "$INPUT" | jq -r '.tool_input.pattern // empty'))
    ;;
esac

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

for filepath in "${PATHS_TO_CHECK[@]}"; do
  [[ -z "$filepath" ]] && continue
  for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if [[ "$filepath" == *"$pattern"* ]]; then
      echo "{\"decision\": \"block\", \"reason\": \"BLOCKED: $filepath contains sensitive data (env vars/secrets). Access is not allowed.\"}"
      exit 0
    fi
  done
done

exit 0
