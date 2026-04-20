#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/tmp/usurahi-library-run.log"

mkdir -p "$(dirname "$LOG_FILE")"

nohup "$BASEDIR/library.sh" >>"$LOG_FILE" 2>&1 &
