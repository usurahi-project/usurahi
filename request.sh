#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# request.sh — 正式依頼入口
#=============================================================================
# Usage:
#   ./request.sh "依頼本文"
#   ./request.sh --request "依頼本文" --background "背景"
#   ./request.sh -l
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_FILE="$BASEDIR/queue/room_requests.yaml"

usage() {
  cat <<'EOF'
Usage:
  ./request.sh "依頼本文"
  ./request.sh --request "依頼本文" --background "背景"
  ./request.sh -l

Options:
  --request      依頼本文
  --background   背景や why
  --requester    依頼者名（省略時: requester）
  -l, --list     正式依頼一覧を表示
  -h, --help     このヘルプを表示
EOF
}

request=""
background=""
requester="requester"
mode="create"

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
    -l|--list)
      mode="list"
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

notify_eru() {
  local request_id="$1"

  # 部室が開いていない間はノックしても届かない
  if ! node "$BASEDIR/scripts/herdr.mjs" exists; then
    return 0
  fi

  if [[ ! -x "$BASEDIR/scripts/notify.sh" ]]; then
    return 0
  fi

  "$BASEDIR/scripts/notify.sh" eru "新しい正式依頼 ${request_id} が入りました。依頼: ${request}" >/dev/null 2>&1 || true
}

if [[ ! -f "$QUEUE_FILE" ]]; then
  mkdir -p "$(dirname "$QUEUE_FILE")"
  printf 'requests: []\n' > "$QUEUE_FILE"
fi

if [[ "$mode" == "list" ]]; then
  node - "$QUEUE_FILE" <<'EOF'
const fs = require("fs");
const yaml = require("js-yaml");

const queueFile = process.argv[2];
const data = yaml.load(fs.readFileSync(queueFile, "utf8")) || {};
const requests = data.requests || [];

if (requests.length === 0) {
  console.log("正式依頼はありません。");
  process.exit(0);
}

for (const item of requests) {
  console.log(`[${item.id}] ${item.status} ${item.request}`);
  if (item.background) console.log(`  背景: ${item.background}`);
  console.log(`  依頼者: ${item.requester || "requester"}`);
}
EOF
  exit 0
fi

if [[ -z "$request" ]]; then
  echo "エラー: 依頼本文が必要です。" >&2
  usage >&2
  exit 1
fi

create_output="$(
QUEUE_FILE="$QUEUE_FILE" REQUEST_TEXT="$request" BACKGROUND_TEXT="$background" REQUESTER_NAME="$requester" node <<'EOF'
const fs = require("fs");
const yaml = require("js-yaml");

const queueFile = process.env.QUEUE_FILE;
const request = process.env.REQUEST_TEXT;
const background = process.env.BACKGROUND_TEXT || "";
const requester = process.env.REQUESTER_NAME || "requester";

const readData = () => {
  if (!fs.existsSync(queueFile)) return { requests: [] };
  return yaml.load(fs.readFileSync(queueFile, "utf8")) || { requests: [] };
};

const writeData = (data) => {
  fs.writeFileSync(queueFile, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
};

const timestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "");

const data = readData();
if (!Array.isArray(data.requests)) data.requests = [];

const maxId = data.requests.reduce((max, item) => {
  const match = String(item.id || "").match(/^request_(\d+)$/);
  if (!match) return max;
  return Math.max(max, Number(match[1]));
}, 0);

const nextId = `request_${String(maxId + 1).padStart(3, "0")}`;

data.requests.push({
  id: nextId,
  request,
  background: background || null,
  requester,
  status: "new",
  created_at: timestamp(),
  response: null,
});

writeData(data);

console.log(`正式依頼を追加しました: ${nextId}`);
console.log(`依頼: ${request}`);
if (background) console.log(`背景: ${background}`);
console.log("えるがこの依頼を拾うと、部会が始まります。");
EOF
)"

printf '%s\n' "$create_output"

request_id="$(printf '%s\n' "$create_output" | sed -n 's/^正式依頼を追加しました: //p' | head -n 1)"
if [[ -n "$request_id" ]]; then
  notify_eru "$request_id"
fi
