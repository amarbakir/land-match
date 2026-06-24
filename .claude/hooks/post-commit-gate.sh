#!/bin/bash
# Runs quality gate after git commit commands.
# Used as a PostToolUse hook on Bash — checks if the command was a git commit
# before running the full gate. Exit 0 = ok, Exit 2 = block with feedback.

# Read the tool input from stdin
INPUT=$(cat)

# Extract the command that was run
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only run the gate after git commit commands
if ! echo "$COMMAND" | grep -qE '(^|\s|&&|;|\|)r?t?k?\s*git commit\b'; then
exit 0
fi

# Delegate to the main quality gate
exec "$CLAUDE_PROJECT_DIR"/.claude/hooks/quality-gate.sh