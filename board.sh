#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_FILE="$BASEDIR/queue/noticeboard.yaml"

usage() {
  cat <<'EOF'
Usage:
  ./board.sh
  ./board.sh list [--status new|in_progress|done|all]
  ./board.sh add "メモ本文"
  ./board.sh add --body "メモ本文" [--author <name>] [--kind <kind>] [--related-request <id>]
  ./board.sh -h | --help

Options:
  --body             掲示板に貼る本文
  --author           投稿者名（省略時: requester）
  --kind             投稿種別（省略時: memo）
  --related-request  関連する正式依頼ID
  --status           一覧表示時のステータス絞り込み
EOF
}

ensure_queue_file() {
  if [[ ! -f "$QUEUE_FILE" ]]; then
    mkdir -p "$(dirname "$QUEUE_FILE")"
    printf 'posts: []\n' > "$QUEUE_FILE"
  fi
}

mode="list"
status="all"
body=""
author="requester"
kind="memo"
related_request=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    add)
      mode="add"
      shift
      ;;
    list)
      mode="list"
      shift
      ;;
    --body)
      body="${2:-}"
      shift 2
      ;;
    --author)
      author="${2:-requester}"
      shift 2
      ;;
    --kind)
      kind="${2:-memo}"
      shift 2
      ;;
    --related-request)
      related_request="${2:-}"
      shift 2
      ;;
    --status)
      status="${2:-all}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ "$mode" == "add" && -z "$body" ]]; then
        body="$1"
        shift
      else
        echo "エラー: 解釈できない引数です: $1" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

ensure_queue_file

case "$mode" in
  list)
    QUEUE_FILE="$QUEUE_FILE" BOARD_STATUS="$status" node <<'EOF'
const fs = require("fs");
const yaml = require("js-yaml");

const queueFile = process.env.QUEUE_FILE;
const status = process.env.BOARD_STATUS || "all";
const data = yaml.load(fs.readFileSync(queueFile, "utf8")) || {};
const posts = Array.isArray(data.posts) ? data.posts : [];
const filtered = status === "all" ? posts : posts.filter((item) => item.status === status);

if (filtered.length === 0) {
  console.log(status === "all" ? "掲示はありません。" : `${status} の掲示はありません。`);
  process.exit(0);
}

for (const item of filtered) {
  const headline = item.body || item.message || "(本文なし)";
  const meta = [`${item.id || "post_???"}`, item.status || "new", item.kind || "memo"].join(" / ");
  console.log(`[${meta}] ${headline}`);
  console.log(`  投稿者: ${item.author || "requester"}`);
  if (item.related_request) console.log(`  関連依頼: ${item.related_request}`);
  if (item.created_at) console.log(`  投稿日時: ${item.created_at}`);
  if (item.response) console.log(`  追記: ${item.response}`);
}
EOF
    ;;
  add)
    if [[ -z "$body" ]]; then
      echo "エラー: 掲示板に貼る本文が必要です。" >&2
      usage >&2
      exit 1
    fi
    QUEUE_FILE="$QUEUE_FILE" BOARD_BODY="$body" BOARD_AUTHOR="$author" BOARD_KIND="$kind" BOARD_RELATED_REQUEST="$related_request" node <<'EOF'
const fs = require("fs");
const yaml = require("js-yaml");

const queueFile = process.env.QUEUE_FILE;
const body = process.env.BOARD_BODY;
const author = process.env.BOARD_AUTHOR || "requester";
const kind = process.env.BOARD_KIND || "memo";
const relatedRequest = process.env.BOARD_RELATED_REQUEST || "";

const readData = () => {
  if (!fs.existsSync(queueFile)) return { posts: [] };
  return yaml.load(fs.readFileSync(queueFile, "utf8")) || { posts: [] };
};

const writeData = (data) => {
  fs.writeFileSync(queueFile, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
};

const timestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "");

const data = readData();
if (!Array.isArray(data.posts)) data.posts = [];

const maxId = data.posts.reduce((max, item) => {
  const match = String(item.id || "").match(/^post_(\d+)$/);
  if (!match) return max;
  return Math.max(max, Number(match[1]));
}, 0);

const nextId = `post_${String(maxId + 1).padStart(3, "0")}`;
const post = {
  id: nextId,
  body,
  author,
  kind,
  status: "new",
  created_at: timestamp(),
  response: null,
};

if (relatedRequest) {
  post.related_request = relatedRequest;
}

data.posts.push(post);
writeData(data);

console.log(`掲示を追加しました: ${nextId}`);
console.log(`本文: ${body}`);
if (relatedRequest) console.log(`関連依頼: ${relatedRequest}`);
EOF
    ;;
esac
