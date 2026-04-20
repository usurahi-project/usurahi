#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# library.sh — 薄氷図書室 URL取り込み（摩耶花を呼び出す）
#=============================================================================
# Usage:
#   ./library.sh                   キューの未処理URLを摩耶花が処理する
#   ./library.sh add <url>         URLを図書室カウンターへ追加する
#   ./library.sh -l                キュー一覧を表示する
#   ./library.sh rebuild <url>     保存済みノートを退避して作り直す
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_FILE="$BASEDIR/queue/library_queue.yaml"
RUN_LOCK_DIR="$BASEDIR/queue/.library-run.lock"
CLAUDE_APP_SH="$BASEDIR/scripts/claude-app.sh"

# PATH にhomebrewを追加（launchd経由対応）
export PATH="/opt/homebrew/bin:$PATH"

# --- 表示ヘルパー（gum がなければプレーンテキスト） ---
if command -v gum &>/dev/null; then
    dim()    { gum style --foreground 240 "  $1"; }
    ok()     { gum style --foreground 76 "  ✓ $1"; }
    warn()   { gum style --foreground 214 "  ⚠ $1"; }
    error()  { gum style --foreground 196 "  ✗ $1" >&2; }
    line()   { gum style --foreground 240 "  ──────────────────────────────"; }
    maya()   { gum style --foreground 213 "  摩耶花「$1」"; }
else
    dim()    { echo "  $1"; }
    ok()     { echo "  ✓ $1"; }
    warn()   { echo "  ⚠ $1"; }
    error()  { echo "  ✗ $1" >&2; }
    line()   { echo "  ──────────────────────────────"; }
    maya()   { echo "  摩耶花「$1」"; }
fi

# --- 図書室バナー ---
show_library_door() {
    if ! command -v gum &>/dev/null; then return; fi
    gum style --foreground 213 "
  ┌────────────────────────────────────────────────────┐
  │                                                    │
  │                       ●                            │
  │                      ╱ ╲                           │
  │                 ╭───╯   ╰───╮                      │
  │                 │            │                      │
  │                 │ 薄氷図書室 │                      │
  │                 │            │                      │
  │                 │  ◆開館中◆  │                      │
  │                 │            │                      │
  │                 │  図書委員  │                      │
  │                 │ 伊原摩耶花 │                      │
  │                 │            │       ━━━━━━○       │
  │                 ╰────────────╯                      │
  │                                                    │
  │                                                    │
  └────────────────────────────────────────────────────┘"
}

# --- 前提条件チェック ---
check_prerequisites() {
    if ! command -v node &>/dev/null; then
        error "node がインストールされていません"
        exit 1
    fi
    if [[ ! -f "$QUEUE_FILE" ]]; then
        echo "urls: []" > "$QUEUE_FILE"
    fi
}

check_run_prerequisites() {
    check_prerequisites
    if [[ ! -x "$CLAUDE_APP_SH" ]]; then
        error "scripts/claude-app.sh を実行できません"
        exit 1
    fi
    if ! "$CLAUDE_APP_SH" --version >/dev/null 2>&1; then
        error "claude (Claude Code CLI) を起動できません"
        exit 1
    fi
}

# --- 件数カウント ---
count_items() {
    local target_status="$1"
    node --input-type=module - "$QUEUE_FILE" "$target_status" <<'NODE'
import fs from "fs";
import yaml from "js-yaml";

const filePath = process.argv[2];
const targetStatus = process.argv[3];
if (!fs.existsSync(filePath)) {
  console.log("0");
  process.exit(0);
}

const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
const urls = Array.isArray(data.urls) ? data.urls : [];
const count = urls.filter((item) => item.status === targetStatus).length;
console.log(String(count));
NODE
}

count_pending() {
    count_items "pending"
}

count_failed() {
    count_items "failed"
}

list_queue_by_status() {
    local target_status="$1"
    local heading="$2"
    local empty_message="$3"

    check_prerequisites
    local count
    count=$(count_items "$target_status")
    if [[ "$count" == "0" ]]; then
        maya "$empty_message"
        return
    fi
    echo ""
    if command -v gum &>/dev/null; then
        gum style --foreground 213 --bold "  📋 ${heading}: ${count}件"
    else
        echo "  📋 ${heading}: ${count}件"
    fi
    echo ""

    list_queue_items "$target_status" | render_queue_items
}

list_queue() {
    list_queue_by_status "pending" "処理待ち" "返却待ちの本はないわよ"
}

list_failed_queue() {
    list_queue_by_status "failed" "失敗" "失敗中の本はないわよ"
}

list_queue_items() {
    local target_status="$1"
    node --input-type=module - "$QUEUE_FILE" "$target_status" <<'NODE'
import fs from "fs";
import yaml from "js-yaml";

const filePath = process.argv[2];
const targetStatus = process.argv[3];
const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
const items = (Array.isArray(data.urls) ? data.urls : []).filter((item) => item.status === targetStatus);

function suggestAction(item) {
  if (item.status !== "failed") return "";

  const stage = item.stage || "";
  const message = String(item.error?.message || "").toLowerCase();

  if (stage === "fetch") return "refetch";
  if (message.includes("取得") || message.includes("could not resolve") || message.includes("timed out") || message.includes("http ")) {
    return "refetch";
  }
  if (stage === "normalize" || stage === "summarize" || stage === "save") {
    return "retry";
  }
  return "retry";
}

for (const item of items) {
  const summary = [
    item.source_type ? `[${item.source_type}]` : "[link]",
    item.author ? `@${item.author}` : "",
    item.intent ? `(${item.intent})` : "",
    item.excerpt ? "[excerpt]" : "",
  ].filter(Boolean).join(" ");
  const extra = item.status === "failed"
    ? `${item.stage || "unknown"} / ${item.error?.message || "unknown error"} / suggest:${suggestAction(item)}`
    : `${item.fetch_status || "not-fetched"}`;
  console.log(`${item.url}\t${summary}\t${extra}`);
}
NODE
}

render_queue_items() {
    while IFS=$'\t' read -r url summary extra; do
        [[ -z "${url:-}" ]] && continue
        if command -v gum &>/dev/null; then
            gum style --foreground 240 "     $url"
            gum style --foreground 245 "       ${summary:-[link]} / ${extra}"
        else
            echo "     $url"
            echo "       ${summary:-[link]} / ${extra}"
        fi
    done
}

add_to_queue() {
    check_prerequisites
    if [[ $# -lt 1 ]]; then
        error "URLを指定してください"
        exit 1
    fi

    local result
    result=$(cd "$BASEDIR" && node scripts/library-add.mjs "$@")
    echo ""
    echo "$result"
    echo ""
}

retry_queue_item() {
    check_prerequisites
    if [[ $# -lt 1 ]]; then
        error "retry には <url> または --failed を指定してください"
        exit 1
    fi

    local result
    result=$(cd "$BASEDIR" && node scripts/library-retry.mjs "$@")
    echo ""
    echo "$result"
    echo ""
}

refetch_queue_item() {
    check_prerequisites
    if [[ $# -lt 1 ]]; then
        error "refetch には <url> または --failed を指定してください"
        exit 1
    fi

    local result
    result=$(cd "$BASEDIR" && node scripts/library-refetch.mjs "$@")
    echo ""
    echo "$result"
    echo ""
}

rebuild_queue_item() {
    check_prerequisites
    if [[ $# -lt 1 ]]; then
        error "rebuild には <url> を指定してください"
        exit 1
    fi

    local result
    result=$(cd "$BASEDIR" && node scripts/library-rebuild.mjs "$@")
    echo ""
    echo "$result"
    echo ""
}

# --- 部会稼働チェック ---
check_bukatsu_active() {
    if tmux has-session -t noticeboard 2>/dev/null || tmux has-session -t clubroom 2>/dev/null; then
        return 0  # 稼働中
    fi
    return 1  # 停止中
}

# --- 図書室処理 ---
run_mayaka() {
    check_run_prerequisites

    if ! mkdir "$RUN_LOCK_DIR" 2>/dev/null; then
        echo ""
        maya "いま整理を回している最中よ。終わるまで少し待ってなさい"
        echo ""
        exit 0
    fi
    trap 'rmdir "$RUN_LOCK_DIR" 2>/dev/null || true' EXIT

    # 未処理件数チェック
    local pending_count
    pending_count=$(count_pending)

    if [[ "$pending_count" == "0" ]]; then
        echo ""
        maya "返す本もないじゃない。帰るわよ"
        echo ""
        exit 0
    fi

    echo ""
    show_library_door
    echo ""

    # 部会稼働中なら警告
    if check_bukatsu_active; then
        warn "部会が稼働中よ。レート制限に引っかかるかも"
        maya "部室が騒がしいわね...まぁやってみるけど"
        echo ""
    fi

    maya "${pending_count}件ね。ちゃんと整理するから待ってなさい"
    echo ""
    local result
    result=$(cd "$BASEDIR" && node scripts/library-run.mjs 2>&1) || true
    echo "$result"

    echo ""
    line
    echo ""
}

# --- メイン ---
main() {
    case "${1:-}" in
        add)
            shift
            add_to_queue "$@"
            ;;
        -l|--list)
            list_queue
            ;;
        --failed)
            list_failed_queue
            ;;
        retry)
            shift
            retry_queue_item "$@"
            ;;
        refetch)
            shift
            refetch_queue_item "$@"
            ;;
        rebuild)
            shift
            rebuild_queue_item "$@"
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  (なし)                 摩耶花を起動してキューを処理する"
            echo "  add <url> [options]    URLを図書室カウンターへ追加する"
            echo "    --note <text>        ひとことメモ"
            echo "    --intent <value>     interesting / try-soon / keep-for-later"
            echo "    --excerpt <text>     抜粋本文（Xはこれを推奨）"
            echo "  -l, --list             処理待ちURL一覧を表示する"
            echo "  rebuild <url>          保存済みノートを退避して作り直す"
            echo "  -h, --help             ヘルプを表示する"
            ;;
        *)
            run_mayaka
            ;;
    esac
}

main "$@"
