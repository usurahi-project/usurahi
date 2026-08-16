#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
GIJIROKU_FILE="$BASEDIR/queue/gijiroku.yaml"

usage() {
  cat <<'EOF'
Usage:
  ./usurahi.sh
  ./usurahi.sh tutorial
  ./usurahi.sh start [--all|--clean|--setup]
  ./usurahi.sh status
  ./usurahi.sh board [args...]
  ./usurahi.sh library [args...]
  ./usurahi.sh stop
  ./usurahi.sh -h | --help

Description:
  薄氷の受付。会議、掲示板、図書館、状態確認への単一入口。

Examples:
  ./usurahi.sh tutorial
  ./usurahi.sh start
  ./usurahi.sh status
  ./usurahi.sh board add "あとで考えたい論点"
  ./usurahi.sh library https://example.com/article
EOF
}

say() {
  printf '受付「%s」\n' "$1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

choose() {
  if has_command gum; then
    gum choose \
      "会議を始める" \
      "進行中の会議を見る" \
      "掲示板に書く" \
      "図書館に入れる" \
      "状態を確認する" \
      "やめる"
    return
  fi

  cat <<'EOF'
1. 会議を始める
2. 進行中の会議を見る
3. 掲示板に書く
4. 図書館に入れる
5. 状態を確認する
0. やめる
EOF
  printf "> " >&2
  IFS= read -r REPLY
  case "$REPLY" in
    1) printf "会議を始める" ;;
    2) printf "進行中の会議を見る" ;;
    3) printf "掲示板に書く" ;;
    4) printf "図書館に入れる" ;;
    5) printf "状態を確認する" ;;
    0) printf "やめる" ;;
    *) printf "unknown" ;;
  esac
}

meeting_summary() {
  node "$BASEDIR/scripts/meeting-highlight.mjs" --print 2>/dev/null || true
}

show_tutorial() {
  say "薄氷の全体像を3分で案内します。"
  echo ""
  cat "$BASEDIR/docs/tutorial.md"
}

has_active_meeting() {
  [[ -f "$GIJIROKU_FILE" ]] || return 1
  node - "$GIJIROKU_FILE" <<'EOF'
const fs = require("fs");
const yaml = require("js-yaml");
const file = process.argv[2];
const data = yaml.load(fs.readFileSync(file, "utf8")) || {};
process.exit(data.meeting ? 0 : 1);
EOF
}

open_clubroom() {
  if ! has_command herdr; then
    echo "エラー: herdr が必要です。" >&2
    exit 1
  fi

  if node "$BASEDIR/scripts/herdr.mjs" exists; then
    # herdr の中にいるならワークスペースを切り替える。外からならまず herdr に入る。
    if [[ "${HERDR_ENV:-}" == "1" ]]; then
      exec node "$BASEDIR/scripts/herdr.mjs" focus
    fi
    say "部室は開いています。herdr の中の clubroom ワークスペースへ移動してください。"
    exec herdr
  fi

  say "部室はまだ開いていません。先に会議を始めます。"
  exec bash "$BASEDIR/meeting.sh"
}

start_meeting() {
  local mode="${1:-}"
  case "$mode" in
    --all)
      exec bash "$BASEDIR/meeting.sh" -a
      ;;
    --clean)
      exec bash "$BASEDIR/meeting.sh" -c
      ;;
    --setup)
      exec bash "$BASEDIR/meeting.sh" -s
      ;;
    "")
      exec bash "$BASEDIR/meeting.sh"
      ;;
    *)
      echo "エラー: start のオプションは --all, --clean, --setup のいずれかです。" >&2
      exit 1
      ;;
  esac
}

show_status() {
  say "今の状態を見ます。"
  echo ""
  node "$BASEDIR/scripts/roster.mjs" entrance
  echo ""
  local summary holder phase next_action
  summary="$(meeting_summary)"
  IFS=$'\t' read -r holder phase next_action <<< "$summary"
  if [[ "${holder:-none}" == "none" && "${phase:-なし}" == "なし" ]]; then
    echo "今は進行中の会議はありません。"
    echo "始めるなら: ./usurahi.sh start"
  else
    echo "フェーズ: ${phase:-なし}"
    echo "ボール: ${holder:-none}"
    echo "次の一手: ${next_action:-なし}"
  fi
  echo ""
  echo "よく使う操作:"
  echo "  会議を始める: ./usurahi.sh start"
  echo "  部室を見る:   ./usurahi.sh room"
  echo "  掲示板:       ./usurahi.sh board list"
  echo "  図書館:       ./usurahi.sh library list"
  echo "  停止:         ./usurahi.sh stop"
}

interactive_main() {
  say "なにをしますか？"
  if has_active_meeting; then
    say "進行中の会議があります。迷ったら「進行中の会議を見る」を選んでください。"
  else
    say "初めてなら「会議を始める」を選べば大丈夫です。"
  fi

  local choice
  choice="$(choose)"

  case "$choice" in
    "会議を始める")
      start_meeting
      ;;
    "進行中の会議を見る")
      open_clubroom
      ;;
    "掲示板に書く")
      exec bash "$BASEDIR/board.sh" add
      ;;
    "図書館に入れる")
      exec bash "$BASEDIR/ribrary.sh" add
      ;;
    "状態を確認する")
      show_status
      ;;
    "やめる")
      say "では、今日はここまで。"
      ;;
    *)
      echo "エラー: 選択肢を解釈できませんでした。" >&2
      exit 1
      ;;
  esac
}

main() {
  if [[ $# -eq 0 ]]; then
    interactive_main
    exit 0
  fi

  case "$1" in
    start)
      shift
      start_meeting "${1:-}"
      ;;
    tutorial|onboarding)
      show_tutorial
      ;;
    room|clubroom)
      open_clubroom
      ;;
    status)
      show_status
      ;;
    board)
      shift
      exec bash "$BASEDIR/board.sh" "$@"
      ;;
    library|ribrary)
      shift
      exec bash "$BASEDIR/ribrary.sh" "$@"
      ;;
    stop)
      exec bash "$BASEDIR/meeting.sh" -k
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "エラー: 解釈できない操作です: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
