#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# meeting.sh — 薄氷（うすらひ）起動スクリプト
#=============================================================================
# Usage:
#   ./meeting.sh          通常起動（える＋ハルヒのみ）
#   ./meeting.sh -w       部員召集（折木・キョン・長門を起動）
#   ./meeting.sh -a       全員起動（える＋ハルヒ＋部員3名を一括起動）
#   ./meeting.sh -s       セットアップのみ（部室の作成のみ、Claude起動なし）
#   ./meeting.sh -c       クリーン起動（キューをリセットしてから起動）
#   ./meeting.sh -k       終了（部室を閉じる）
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
HERDR="$BASEDIR/scripts/herdr.mjs"

# --- 表示ヘルパー ---
dim()    { gum style --foreground 240 "  $1"; }
ok()     { gum style --foreground 76 "  ✓ $1"; }
warn()   { gum style --foreground 214 "  ⚠ $1"; }
error()  { gum style --foreground 196 "  ✗ $1" >&2; }
line()   { gum style --foreground 240 "  ──────────────────────────────"; }

# --- 和暦日付 ---
wareki_date() {
    local m d
    m=$(date +%-m)
    d=$(date +%-d)
    local -a months=("" "睦月" "如月" "弥生" "卯月" "皐月" "水無月" "文月" "葉月" "長月" "神無月" "霜月" "師走")
    local -a kanji=("" "一" "二" "三" "四" "五" "六" "七" "八" "九" "十" "十一" "十二" "十三" "十四" "十五" "十六" "十七" "十八" "十九" "二十" "二十一" "二十二" "二十三" "二十四" "二十五" "二十六" "二十七" "二十八" "二十九" "三十" "三十一")
    echo "${months[$m]}${kanji[$d]}日"
}

# --- 黒板バナー ---
show_blackboard() {
    local today
    today=$(wareki_date)
    gum style --foreground 123 "
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃┌──────────────────────────────────────────────────────┐┃
  ┃│                                                      │┃
  ┃│                                                      │┃
  ┃│            ❄  薄 氷 （ う す ら ひ ）  ❄             │┃
  ┃│                                                      │┃
  ┃│             SOS団  ×  古典部   合同部活               │┃
  ┃│                                                      │┃
  ┃│                                                      │┃
  ┃│                                        ${today}      │┃
  ┃│                                                      │┃
  ┃└──────────────────────────────────────────────────────┘┃
  ┃  ▄▄▄▄▄▄▄                                  ╱╱  ○  ○  ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛"
}

# --- 前提条件チェック ---
check_prerequisites() {
    local missing=0

    if ! command -v herdr &>/dev/null; then
        error "herdr がインストールされていません"
        echo "  brew install herdr"
        missing=1
    fi

    if ! command -v claude &>/dev/null; then
        error "claude (Claude Code CLI) がインストールされていません"
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        exit 1
    fi

    dim "前提条件OK"
}

# --- キューリセット ---
write_default_blackboard() {
    cat > "$BASEDIR/blackboard.md" << 'MD'
# 黒板
更新: ---

## 📌 依頼
なし

## 🟨 フェーズ
---

## ✅ 決まったこと
---

## ✔ 完了レポート
---

## 📝 結論
---
MD
}

ensure_runtime_state() {
    mkdir -p "$BASEDIR/queue/tasks" "$BASEDIR/queue/reports"

    [[ -f "$BASEDIR/queue/noticeboard.yaml" ]] || cat > "$BASEDIR/queue/noticeboard.yaml" << 'YAML'
posts: []
YAML

    [[ -f "$BASEDIR/queue/room_requests.yaml" ]] || cat > "$BASEDIR/queue/room_requests.yaml" << 'YAML'
requests: []
YAML

    [[ -f "$BASEDIR/queue/gijiroku.yaml" ]] || cat > "$BASEDIR/queue/gijiroku.yaml" << 'YAML'
meeting: null
YAML

    for member in oreki kyon nagato; do
        [[ -f "$BASEDIR/queue/tasks/${member}.yaml" ]] || cat > "$BASEDIR/queue/tasks/${member}.yaml" << YAML
task: null
YAML
        [[ -f "$BASEDIR/queue/reports/${member}_report.yaml" ]] || cat > "$BASEDIR/queue/reports/${member}_report.yaml" << YAML
report: null
YAML
    done

    [[ -f "$BASEDIR/queue/library_queue.yaml" ]] || cat > "$BASEDIR/queue/library_queue.yaml" << 'YAML'
urls: []
YAML

    [[ -f "$BASEDIR/blackboard.md" ]] || write_default_blackboard
}

reset_queues() {
    dim "キューをリセットしています..."

    mkdir -p "$BASEDIR/queue/tasks" "$BASEDIR/queue/reports"

    cat > "$BASEDIR/queue/noticeboard.yaml" << 'YAML'
posts: []
YAML

    cat > "$BASEDIR/queue/room_requests.yaml" << 'YAML'
requests: []
YAML

    cat > "$BASEDIR/queue/gijiroku.yaml" << 'YAML'
meeting: null
YAML

    for member in oreki kyon nagato; do
        cat > "$BASEDIR/queue/tasks/${member}.yaml" << YAML
task: null
YAML
        cat > "$BASEDIR/queue/reports/${member}_report.yaml" << YAML
report: null
YAML
    done

    rm -f "$BASEDIR/queue/tasks/koizumi.yaml"
    rm -f "$BASEDIR/queue/reports/koizumi_report.yaml"

    # 図書館キュー初期化
    cat > "$BASEDIR/queue/library_queue.yaml" << 'YAML'
urls: []
YAML

    # 黒板初期化
    write_default_blackboard

    dim "キューリセット完了"
}

# --- 部室を閉じる ---
kill_sessions() {
    dim "部室を閉じています..."
    node "$HERDR" kill
}

# --- 部室の作成 ---
setup_sessions() {
    # 部員の記憶（黒板・依頼キュー・議事録）を毎回まっさらに
    # （前回会議の残滓を引きずって過去分析に走るのを防ぐ）
    write_default_blackboard
    cat > "$BASEDIR/queue/room_requests.yaml" << 'YAML'
requests: []
YAML
    cat > "$BASEDIR/queue/gijiroku.yaml" << 'YAML'
meeting: null
YAML

    dim "部室を用意しています..."

    # 3列 x 2段の格子と黒板ループは herdr.mjs の layout.apply が一度に組む。
    # 各ペインには名前が付き、以降の宛先解決はその名前で行う。
    dim "  ペイン割り当て:"
    node "$HERDR" setup
}

# --- Claude Code 起動 ---
launch_claude() {
    dim "Claude Code を起動しています..."

    # 起動・プロンプト待ち・ブート送信は herdr.mjs が agent.start / agent.wait /
    # agent.prompt で行う。画面を grep して ❯ を探す必要はない。
    node "$HERDR" launch eru haruhi

    echo ""
    line
    echo ""
    gum style --foreground 255 "  える＋ハルヒが部室に来ました"
    echo ""
    gum style --foreground 240 "  部室を覗く  $(gum style --foreground 123 './usurahi.sh clubroom')"
    gum style --foreground 240 "  部員を呼ぶ  $(gum style --foreground 123 './meeting.sh -w')"
    echo ""
}

# --- 部員召集（遅延起動） ---
launch_workers() {
    echo -e "  部員を呼んでいます..."

    if ! node "$HERDR" exists; then
        error "部室がありません。先に meeting.sh を実行してください"
        exit 1
    fi

    # 既に起動しているペインは herdr.mjs 側で検出してスキップされる
    node "$HERDR" launch oreki kyon nagato

    echo ""
    line
    echo ""
    gum style --foreground 255 "  全員揃いました"
    echo ""
}

# --- メイン ---
main() {
    local mode="normal"

    while getopts "scwak" opt; do
        case $opt in
            s) mode="setup" ;;
            c) mode="clean" ;;
            w) mode="workers" ;;
            a) mode="all" ;;
            k) mode="kill" ;;
            *) echo "Usage: $0 [-s|-c|-w|-a|-k]"; exit 1 ;;
        esac
    done

    echo ""
    show_blackboard
    echo ""

    check_prerequisites

    case $mode in
        kill)
            kill_sessions
            echo ""
            gum style --foreground 240 --italic "  下校しました。また明日"
            echo ""
            exit 0
            ;;
        setup)
            ensure_runtime_state
            setup_sessions
            echo ""
            gum style --foreground 240 --italic "  部室の鍵を開けました（まだ誰も来てません）"
            gum style --foreground 240 "  部室を覗く  $(gum style --foreground 123 './usurahi.sh clubroom')"
            gum style --foreground 240 "  会議を始める  $(gum style --foreground 123 './usurahi.sh start')"
            ;;
        clean)
            reset_queues
            setup_sessions
            launch_claude
            ;;
        workers)
            launch_workers
            ;;
        all)
            ensure_runtime_state
            setup_sessions
            launch_claude
            sleep 5
            launch_workers
            ;;
        normal)
            ensure_runtime_state
            setup_sessions
            launch_claude
            ;;
    esac

    echo ""
}

main "$@"
