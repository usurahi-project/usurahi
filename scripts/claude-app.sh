#!/usr/bin/env bash
set -euo pipefail

# Use Claude Code with Claude App subscription auth instead of API key auth.
unset ANTHROPIC_API_KEY

exec claude "$@"
