#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$BASEDIR/queue/.autopilot.pid"
LOCKDIR="$BASEDIR/queue/.autopilot.lock"
LOG_FILE="/tmp/usurahi-autopilot.log"
INTERVAL_SECONDS="${USURAHI_AUTOPILOT_INTERVAL:-15}"

export PATH="/opt/homebrew/bin:$PATH"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/autopilot.sh start
  ./scripts/autopilot.sh stop
  ./scripts/autopilot.sh status
  ./scripts/autopilot.sh run
EOF
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

current_pid() {
  if [[ -f "$PID_FILE" ]]; then
    cat "$PID_FILE"
  fi
}

ensure_queue_dir() {
  mkdir -p "$BASEDIR/queue"
}

count_pending_library() {
  node --input-type=module - "$BASEDIR/queue/library_queue.yaml" <<'NODE'
import fs from "fs";
import yaml from "js-yaml";

const queueFile = process.argv[2];
if (!fs.existsSync(queueFile)) {
  console.log("0");
  process.exit(0);
}

const data = yaml.load(fs.readFileSync(queueFile, "utf8")) || {};
const items = Array.isArray(data.urls) ? data.urls : [];
const count = items.filter((item) => item.status === "pending").length;
console.log(String(count));
NODE
}

ensure_meeting_running() {
  local noticeboard_exists=0
  local clubroom_exists=0

  if tmux has-session -t noticeboard 2>/dev/null; then
    noticeboard_exists=1
  fi
  if tmux has-session -t clubroom 2>/dev/null; then
    clubroom_exists=1
  fi

  if [[ "$noticeboard_exists" -eq 1 && "$clubroom_exists" -eq 1 ]]; then
    return 0
  fi

  echo "[autopilot] meeting bootstrap: noticeboard=${noticeboard_exists} clubroom=${clubroom_exists}"
  bash "$BASEDIR/meeting.sh" -a
}

ensure_library_running() {
  local pending_count
  pending_count="$(count_pending_library)"

  if [[ "$pending_count" == "0" ]]; then
    return 0
  fi

  if [[ -d "$BASEDIR/queue/.library-run.lock" ]]; then
    return 0
  fi

  echo "[autopilot] library bootstrap: pending=${pending_count}"
  bash "$BASEDIR/scripts/launch-library-run.sh"
}

run_school_cycle() {
  if [[ ! -f "$BASEDIR/scripts/school-cycle.mjs" ]]; then
    return 0
  fi

  echo "[autopilot] school cycle"
  USURAHI_ENABLE_SCHOOL_NETWORK="${USURAHI_ENABLE_SCHOOL_NETWORK:-0}" \
    node "$BASEDIR/scripts/school-cycle.mjs"
}

cleanup() {
  rm -f "$PID_FILE"
  rmdir "$LOCKDIR" 2>/dev/null || true
}

run_loop() {
  ensure_queue_dir

  if ! mkdir "$LOCKDIR" 2>/dev/null; then
    echo "autopilot is already running" >&2
    exit 1
  fi

  trap cleanup EXIT INT TERM
  echo "$$" > "$PID_FILE"
  echo "[autopilot] started pid=$$ interval=${INTERVAL_SECONDS}s"

  while true; do
    ensure_meeting_running
    ensure_library_running
    run_school_cycle
    sleep "$INTERVAL_SECONDS"
  done
}

start() {
  ensure_queue_dir
  local pid
  pid="$(current_pid || true)"

  if is_pid_running "$pid"; then
    echo "autopilot is already running: pid=$pid"
    exit 0
  fi

  rm -f "$PID_FILE"
  nohup "$0" run >>"$LOG_FILE" 2>&1 &
  sleep 1

  pid="$(current_pid || true)"
  if is_pid_running "$pid"; then
    echo "autopilot started: pid=$pid log=$LOG_FILE"
    exit 0
  fi

  echo "failed to start autopilot; check $LOG_FILE" >&2
  exit 1
}

stop() {
  local pid
  pid="$(current_pid || true)"

  if ! is_pid_running "$pid"; then
    rm -f "$PID_FILE"
    rmdir "$LOCKDIR" 2>/dev/null || true
    echo "autopilot is not running"
    exit 0
  fi

  kill "$pid"
  echo "autopilot stopped: pid=$pid"
}

status() {
  local pid
  pid="$(current_pid || true)"

  if is_pid_running "$pid"; then
    echo "autopilot is running: pid=$pid log=$LOG_FILE"
  else
    echo "autopilot is stopped"
  fi
}

main() {
  case "${1:-}" in
    start)
      start
      ;;
    stop)
      stop
      ;;
    status)
      status
      ;;
    run)
      run_loop
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
