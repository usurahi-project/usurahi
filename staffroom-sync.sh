#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$BASEDIR/staffroom"
TARGET_DIR="${OBSIDIAN_STAFFROOM_DIR:-$HOME/Documents/Obsidian Vault/薄氷/職員室}"

usage() {
  cat <<'EOF'
Usage:
  ./staffroom-sync.sh
  ./staffroom-sync.sh --list

Options:
  --list    同期対象一覧を表示する
  -h        ヘルプを表示する
EOF
}

declare -a SYNC_MAP=(
  "overview.md:職員室の案内.md"
  "how_to_use.md:薄氷の使い方.md"
  "world_and_roles.md:薄氷の世界観と役割.md"
  "technical_design.md:薄氷の技術設計.md"
  "naming_principles.md:薄氷の命名原則.md"
)

list_targets() {
  for entry in "${SYNC_MAP[@]}"; do
    local src="${entry%%:*}"
    local dst="${entry#*:}"
    echo "$SOURCE_DIR/$src -> $TARGET_DIR/$dst"
  done
}

sync_files() {
  mkdir -p "$TARGET_DIR"

  local synced=0
  for entry in "${SYNC_MAP[@]}"; do
    local src="${entry%%:*}"
    local dst="${entry#*:}"
    local src_path="$SOURCE_DIR/$src"
    local dst_path="$TARGET_DIR/$dst"

    if [[ ! -f "$src_path" ]]; then
      echo "skip: missing $src_path" >&2
      continue
    fi

    cp "$src_path" "$dst_path"
    echo "synced: $dst"
    synced=$(( synced + 1 ))
  done

  echo "done: ${synced} files"
}

main() {
  case "${1:-}" in
    --list)
      list_targets
      ;;
    -h|--help)
      usage
      ;;
    "")
      sync_files
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "${1:-}"
