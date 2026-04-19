#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$BASEDIR/library.sh"

usage() {
  cat <<'EOF'
Usage:
  ./ribrary.sh
  ./ribrary.sh <url>
  ./ribrary.sh add <url> [--note <text>] [--intent <value>] [--excerpt <text>]
  ./ribrary.sh list
  ./ribrary.sh failed
  ./ribrary.sh run
  ./ribrary.sh retry [--failed|<url>]
  ./ribrary.sh refetch [--failed|<url>]
  ./ribrary.sh -h | --help

Description:
  摩耶花の受付から図書室の次アクションを選ぶための入口。
  実処理は既存の ./library.sh を呼び出す。
EOF
}

maya() {
  printf "摩耶花「%s」\n" "$1"
}

is_url() {
  [[ "${1:-}" =~ ^https?:// ]]
}

is_x_url() {
  [[ "${1:-}" =~ ^https?://(www\.)?(x\.com|twitter\.com)/ ]]
}

run_backend() {
  bash "$BACKEND" "$@"
}

prompt_line() {
  local label="$1"
  printf "%s\n> " "$label" >&2
  IFS= read -r REPLY
  printf '%s' "$REPLY"
}

choose_menu() {
  cat <<'EOF'
1. 本を入れる
2. 入っている本を見る
3. 失敗した本を見る
4. 図書室を進める
5. もう一回やり直す
6. 取り直す
0. やめる
EOF
  printf "> " >&2
  IFS= read -r REPLY
  printf '%s' "$REPLY"
}

add_book_interactive() {
  local url note intent excerpt

  url="${1:-}"
  if [[ -z "$url" ]]; then
    url="$(prompt_line "入れたい本はなに？ URL をちょうだい")"
  fi

  if [[ -z "$url" ]]; then
    echo "エラー: URL が必要です。" >&2
    exit 1
  fi

  note="$(prompt_line "ひとことメモはある？ なければ空で大丈夫")"
  intent="$(prompt_line "保存意図はある？ interesting / try-soon / keep-for-later のどれか。なければ空で大丈夫")"

  if is_x_url "$url"; then
    excerpt="$(prompt_line "X の投稿なら抜粋があると助かるわ。あれば貼って")"
  else
    excerpt=""
  fi

  local -a cmd=(add "$url")
  [[ -n "$note" ]] && cmd+=(--note "$note")
  [[ -n "$intent" ]] && cmd+=(--intent "$intent")
  [[ -n "$excerpt" ]] && cmd+=(--excerpt "$excerpt")
  run_backend "${cmd[@]}"
}

retry_interactive() {
  local target
  maya "どれをもう一回やるの？"
  cat <<'EOF'
1. 失敗したものを全部戻す
2. URL を指定する
EOF
  printf "> " >&2
  IFS= read -r target

  case "$target" in
    1)
      run_backend retry --failed
      ;;
    2)
      target="$(prompt_line "URL を貼って")"
      if [[ -z "$target" ]]; then
        echo "エラー: URL が必要です。" >&2
        exit 1
      fi
      run_backend retry "$target"
      ;;
    *)
      echo "エラー: 1 か 2 を選んでください。" >&2
      exit 1
      ;;
  esac
}

refetch_interactive() {
  local target
  maya "どれを取り直すの？"
  cat <<'EOF'
1. 失敗したものを全部戻す
2. URL を指定する
EOF
  printf "> " >&2
  IFS= read -r target

  case "$target" in
    1)
      run_backend refetch --failed
      ;;
    2)
      target="$(prompt_line "URL を貼って")"
      if [[ -z "$target" ]]; then
        echo "エラー: URL が必要です。" >&2
        exit 1
      fi
      run_backend refetch "$target"
      ;;
    *)
      echo "エラー: 1 か 2 を選んでください。" >&2
      exit 1
      ;;
  esac
}

interactive_main() {
  local choice
  maya "なに？"
  choice="$(choose_menu)"

  case "$choice" in
    1)
      add_book_interactive
      ;;
    2)
      run_backend -l
      ;;
    3)
      run_backend --failed
      ;;
    4)
      run_backend
      ;;
    5)
      retry_interactive
      ;;
    6)
      refetch_interactive
      ;;
    0)
      maya "じゃあ今日は閉めるわ"
      ;;
    *)
      echo "エラー: 0-6 のどれかを選んでください。" >&2
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
    -h|--help)
      usage
      ;;
    add)
      shift
      if [[ $# -gt 0 ]] && is_url "$1"; then
        run_backend add "$@"
      else
        add_book_interactive "${1:-}"
      fi
      ;;
    list)
      shift
      run_backend -l "$@"
      ;;
    failed)
      shift
      run_backend --failed "$@"
      ;;
    run)
      shift
      run_backend "$@"
      ;;
    retry)
      shift
      if [[ $# -eq 0 ]]; then
        retry_interactive
      else
        run_backend retry "$@"
      fi
      ;;
    refetch)
      shift
      if [[ $# -eq 0 ]]; then
        refetch_interactive
      else
        run_backend refetch "$@"
      fi
      ;;
    *)
      if is_url "$1"; then
        add_book_interactive "$1"
      else
        echo "エラー: 解釈できない引数です: $1" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
}

main "$@"
