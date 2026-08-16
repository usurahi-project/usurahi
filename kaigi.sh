#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./kaigi.sh
  ./kaigi.sh "依頼本文"
  ./kaigi.sh --request "依頼本文" [--background "背景"] [--requester <name>]
  ./kaigi.sh --no-board
  ./kaigi.sh --no-attach
  ./kaigi.sh -h | --help

Options:
  --request     依頼本文
  --background  背景やメモ
  --requester   依頼者名（省略時: requester）
  --no-board    掲示板への共有を省く
  --no-attach   最後に部室へ入らない
EOF
}

request=""
background=""
requester="requester"
share_board=1
attach_room=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --request)
      request="${2:-}"
      shift 2
      ;;
    --background)
      background="${2:-}"
      shift 2
      ;;
    --requester)
      requester="${2:-requester}"
      shift 2
      ;;
    --no-board)
      share_board=0
      shift
      ;;
    --no-attach)
      attach_room=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$request" ]]; then
        request="$1"
        shift
      else
        echo "エラー: 解釈できない引数です: $1" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$request" ]]; then
  if [[ -t 0 ]]; then
    printf "したい依頼はなんですか？\n> "
    IFS= read -r request
  fi
fi

if [[ -z "$request" ]]; then
  echo "エラー: 依頼本文が必要です。" >&2
  usage >&2
  exit 1
fi

if [[ -z "$background" && -t 0 ]]; then
  printf "\n背景やメモがあれば書いてください。なければ空で進めます。\n> "
  IFS= read -r background
fi

ensure_meeting_running() {
  if node "$BASEDIR/scripts/herdr.mjs" exists; then
    return 0
  fi
  "$BASEDIR/meeting.sh"
}

submit_request() {
  local output
  if [[ -n "$background" ]]; then
    output=$("$BASEDIR/request.sh" --request "$request" --background "$background" --requester "$requester")
  else
    output=$("$BASEDIR/request.sh" --request "$request" --requester "$requester")
  fi
  printf '%s\n' "$output"
}

post_to_board() {
  local request_id="$1"
  local board_body
  board_body="正式依頼 ${request_id}: ${request}"
  if [[ -n "$background" ]]; then
    board_body="${board_body}
背景: ${background}"
  fi
  bash "$BASEDIR/board.sh" add --body "$board_body" --author "$requester" --kind "request-share" --related-request "$request_id" >/dev/null
}

ensure_meeting_running

request_output="$(submit_request)"
printf '\n%s\n' "$request_output"

request_id="$(printf '%s\n' "$request_output" | sed -n 's/^正式依頼を追加しました: //p' | head -n 1)"
if [[ -z "$request_id" ]]; then
  echo "エラー: 依頼IDを取得できませんでした。" >&2
  exit 1
fi

if [[ "$share_board" -eq 1 ]]; then
  post_to_board "$request_id"
  printf '\n掲示板に共有しました: %s\n' "$request_id"
fi

printf '\n部会を始めます。'
if [[ "$attach_room" -eq 1 ]]; then
  printf ' 部室へつなぎます。\n\n'
else
  printf '\n\n'
fi

if [[ "$attach_room" -eq 1 ]]; then
  exec bash "$BASEDIR/usurahi.sh" clubroom
fi
