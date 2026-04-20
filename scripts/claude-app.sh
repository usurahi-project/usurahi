#!/usr/bin/env bash
set -euo pipefail

# Use Claude Code with Claude App subscription auth instead of API key auth.
unset ANTHROPIC_API_KEY

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "claude binary is not executable: $CLAUDE_BIN" >&2
  exit 1
fi

exec "$CLAUDE_BIN" "$@"
