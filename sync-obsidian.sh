#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="${OBSIDIAN_USURAHI_DIR:-$HOME/Documents/Obsidian Vault/薄氷}"
STAFFROOM_DIR="$VAULT_ROOT/職員室"
ARCHIVE_DIR="$VAULT_ROOT/図書館/薄氷バックナンバー"
ACTIVITY_LOG_DIR="$VAULT_ROOT/部室/活動記録"

sync_staffroom() {
  "$BASEDIR/staffroom-sync.sh"
}

sync_archive() {
  mkdir -p "$ARCHIVE_DIR"
  local count=0
  while IFS= read -r -d '' file; do
    cp "$file" "$ARCHIVE_DIR/"
    count=$(( count + 1 ))
  done < <(find "$BASEDIR/archive" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)
  echo "synced archive: ${count} files"
}

sync_activity_log() {
  mkdir -p "$ACTIVITY_LOG_DIR"
  local count=0
  while IFS= read -r -d '' file; do
    cp "$file" "$ACTIVITY_LOG_DIR/"
    count=$(( count + 1 ))
  done < <(find "$BASEDIR/activity-log" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)
  echo "synced activity-log: ${count} files"
}

usage() {
  cat <<'EOF'
Usage:
  ./sync-obsidian.sh
  ./sync-obsidian.sh --staffroom
  ./sync-obsidian.sh --archive
  ./sync-obsidian.sh --activity-log
  ./sync-obsidian.sh --list

Options:
  --staffroom     職員室文書だけ同期する
  --archive       アーカイブだけ同期する
  --activity-log  活動記録だけ同期する
  --list          同期対象の概要を表示する
  -h, --help      ヘルプを表示する
EOF
}

list_targets() {
  cat <<EOF
staffroom     -> $STAFFROOM_DIR
archive       -> $ARCHIVE_DIR
activity-log  -> $ACTIVITY_LOG_DIR
EOF
}

main() {
  local ran=0

  if [[ $# -eq 0 ]]; then
    sync_staffroom
    sync_archive
    sync_activity_log
    exit 0
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --staffroom)
        sync_staffroom
        ran=1
        ;;
      --archive)
        sync_archive
        ran=1
        ;;
      --activity-log)
        sync_activity_log
        ran=1
        ;;
      --list)
        list_targets
        ran=1
        ;;
      -h|--help)
        usage
        ran=1
        ;;
      *)
        echo "error: unknown option: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
    shift
  done

  if [[ $ran -eq 0 ]]; then
    usage
  fi
}

main "$@"
