#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# kaigi.sh — 薄氷（うすらひ）起動スクリプト
#=============================================================================
# Usage:
#   ./kaigi.sh          通常起動（える＋ハルヒのみ）
#   ./kaigi.sh -w       部員召集（折木・キョン・長門を起動）
#   ./kaigi.sh -a       全員起動（える＋ハルヒ＋部員3名を一括起動）
#   ./kaigi.sh -s       セットアップのみ（tmuxセッション作成、Claude起動なし）
#   ./kaigi.sh -c       クリーン起動（キューをリセットしてから起動）
#   ./kaigi.sh -k       終了（tmuxセッションを閉じる）
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
KEIJIBAN_SESSION="keijiban"
BUSHITSU_SESSION="bushitsu"

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

    if ! command -v tmux &>/dev/null; then
        error "tmux がインストールされていません"
        echo "  brew install tmux"
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
reset_queues() {
    dim "キューをリセットしています..."

    cat > "$BASEDIR/queue/keijiban.yaml" << 'YAML'
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
    cat > "$BASEDIR/queue/toshoshitsu_queue.yaml" << 'YAML'
urls: []
YAML

    # 黒板初期化
    cat > "$BASEDIR/kokuban.md" << 'MD'
# 黒板
最終更新: ---

## 📌 依頼
なし

## 🧭 背景
---

## 🧩 論点
---

## ⚠️ 懸念
---

## 👥 タスク
---

## ✅ 決まったこと
---

## ⏸ 保留
---

## ✔ 完了
---

## 📝 今の部としての結論
---

## 🚪 提出
未提出

## 💡 メモ
なし
MD

    dim "キューリセット完了"
}

# --- 既存セッション終了 ---
kill_sessions() {
    dim "既存セッションを終了しています..."
    tmux kill-session -t "$KEIJIBAN_SESSION" 2>/dev/null && dim "  $KEIJIBAN_SESSION 終了" || true
    tmux kill-session -t "$BUSHITSU_SESSION" 2>/dev/null && dim "  $BUSHITSU_SESSION 終了" || true
}

# --- tmuxセッション作成 ---
setup_sessions() {
    # 既存セッションがあれば終了
    kill_sessions

    dim "tmuxセッションを作成しています..."

    # --- keijiban セッション（える用・掲示板の窓口） ---
    tmux new-session -d -s "$KEIJIBAN_SESSION" -c "$BASEDIR" -x 200 -y 50
    tmux set-option -t "$KEIJIBAN_SESSION" pane-border-format " える（副部長・連絡役） "
    tmux set-option -t "$KEIJIBAN_SESSION" pane-border-status top
    dim "  keijiban セッション作成（える）"

    # --- bushitsu セッション（ハルヒ + 部員3名 = 4ペイン） ---
    # base-index を 0 に固定してペイン番号の安定性を保証
    tmux new-session -d -s "$BUSHITSU_SESSION" -c "$BASEDIR" -x 200 -y 50
    tmux set-option -t "$BUSHITSU_SESSION" pane-base-index 0

    # ペイン分割: 4ペイン構成
    # 注意: split-window 後のインデックスは環境依存のため、
    #       下部のペインマッピングログで実際の割り当てを確認すること。
    #       ズレがあれば renraku.sh の resolve_pane を修正する。
    tmux split-window -t "${BUSHITSU_SESSION}" -h -c "$BASEDIR"
    tmux split-window -t "${BUSHITSU_SESSION}" -v -c "$BASEDIR"
    tmux split-window -t "${BUSHITSU_SESSION}" -v -c "$BASEDIR"

    # ペインタイトル設定（renraku.sh のペイン番号と一致させる）
    tmux select-pane -t "${BUSHITSU_SESSION}.0" -T "ハルヒ（部長）"
    tmux select-pane -t "${BUSHITSU_SESSION}.1" -T "折木（部員）"
    tmux select-pane -t "${BUSHITSU_SESSION}.2" -T "キョン（部員）"
    tmux select-pane -t "${BUSHITSU_SESSION}.3" -T "長門（部員）"

    # ペインボーダーにタイトル表示
    tmux set-option -t "$BUSHITSU_SESSION" pane-border-format " #{pane_title} "
    tmux set-option -t "$BUSHITSU_SESSION" pane-border-status top

    # レイアウト調整
    tmux select-layout -t "$BUSHITSU_SESSION" tiled

    # ペインマッピングを検証して記録
    dim "  bushitsu ペインマッピング:"
    for i in 0 1 2 3; do
        local title
        title=$(tmux display-message -t "${BUSHITSU_SESSION}.${i}" -p '#{pane_title}' 2>/dev/null || echo "???")
        dim "    pane $i → $title"
    done
}

# --- Claude Code 起動 ---
launch_claude() {
    dim "Claude Code を起動しています..."

    local common_flags="--dangerously-skip-permissions"

    # Claude Code のプロンプト検出（❯ = U+276F が入力待ちの目印）
    detect_prompt() {
        local pane="$1"
        local content
        content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
        echo "$content" | grep -q '❯'
    }

    # エージェント起動ヘルパー
    launch_agent() {
        local pane="$1"
        local model="$2"
        local boot_file="$3"
        local name="$4"

        # 対話モードで Claude Code を起動
        tmux send-keys -t "$pane" "claude --model $model $common_flags" Enter

        # ダイアログ or プロンプトを待つ（統合ループ、最大45秒）
        local waited=0
        local ready=0
        while [[ $waited -lt 45 ]]; do
            sleep 2
            waited=$(( waited + 2 ))
            local pane_content
            pane_content=$(tmux capture-pane -t "$pane" -p -S -10 2>/dev/null || true)

            # ダイアログ検出 → 承認
            if echo "$pane_content" | grep -q "Yes, I accept"; then
                tmux send-keys -t "$pane" Down
                sleep 0.3
                tmux send-keys -t "$pane" Enter
                dim "    ${name}: バイパス権限承認"
                # 承認後、プロンプトを待つ
                sleep 3
            fi

            # プロンプト検出（行頭の ">"）
            if detect_prompt "$pane"; then
                ready=1
                break
            fi
        done

        if [[ $ready -eq 0 ]]; then
            warn "  ${name}: プロンプト検出タイムアウト（${waited}秒）— boot送信を試行"
        fi

        # 初期プロンプトを送信（-l でリテラル送信、特殊文字の干渉を防ぐ）
        local boot_text
        boot_text=$(cat "$boot_file")
        tmux send-keys -t "$pane" -l "$boot_text"
        tmux send-keys -t "$pane" Enter
        ok "${name}"
    }

    # える（Opus）— keijiban セッション
    launch_agent "${KEIJIBAN_SESSION}.0" "claude-opus-4-6" \
        "$BASEDIR/instructions/eru_boot.txt" "える"

    sleep 5  # Opus→Opus: レート制限対策で長めに

    # ハルヒ（Opus）— bushitsu pane 0
    launch_agent "${BUSHITSU_SESSION}.0" "claude-opus-4-6" \
        "$BASEDIR/instructions/haruhi_boot.txt" "ハルヒ"

    echo ""
    line
    echo ""
    gum style --foreground 255 "  える＋ハルヒが部室に来ました"
    echo ""
    gum style --foreground 240 "  えるに話す  $(gum style --foreground 123 'tmux attach -t keijiban')"
    gum style --foreground 240 "  部室を覗く  $(gum style --foreground 123 'tmux attach -t bushitsu')"
    gum style --foreground 240 "  部員を呼ぶ  $(gum style --foreground 123 '~/usurahi/kaigi.sh -w')"
    echo ""
}

# --- 部員召集（遅延起動） ---
launch_workers() {
    echo -e "  部員を呼んでいます..."

    local common_flags="--dangerously-skip-permissions"

    # bushitsu セッションが存在するか確認
    if ! tmux has-session -t "$BUSHITSU_SESSION" 2>/dev/null; then
        error "bushitsu セッションがありません。先に kaigi.sh を実行してください"
        exit 1
    fi

    # Claude Code のプロンプト検出
    detect_prompt() {
        local pane="$1"
        local content
        content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
        echo "$content" | grep -q '❯'
    }

    # エージェント起動ヘルパー（launch_claude と同じ）
    launch_agent() {
        local pane="$1"
        local model="$2"
        local boot_file="$3"
        local name="$4"

        # 既に Claude が起動しているペインはスキップ
        if detect_prompt "$pane"; then
            dim "  ${name}: 既に起動済み — スキップ"
            return
        fi

        tmux send-keys -t "$pane" "claude --model $model $common_flags" Enter

        local waited=0
        local ready=0
        while [[ $waited -lt 45 ]]; do
            sleep 2
            waited=$(( waited + 2 ))
            local pane_content
            pane_content=$(tmux capture-pane -t "$pane" -p -S -10 2>/dev/null || true)

            if echo "$pane_content" | grep -q "Yes, I accept"; then
                tmux send-keys -t "$pane" Down
                sleep 0.3
                tmux send-keys -t "$pane" Enter
                dim "    ${name}: バイパス権限承認"
                sleep 3
            fi

            if detect_prompt "$pane"; then
                ready=1
                break
            fi
        done

        if [[ $ready -eq 0 ]]; then
            warn "  ${name}: プロンプト検出タイムアウト（${waited}秒）— boot送信を試行"
        fi

        local boot_text
        boot_text=$(cat "$boot_file")
        tmux send-keys -t "$pane" -l "$boot_text"
        tmux send-keys -t "$pane" Enter
        ok "${name}"
    }

    # 折木（Sonnet）— bushitsu pane 1
    launch_agent "${BUSHITSU_SESSION}.1" "claude-sonnet-4-5-20250929" \
        "$BASEDIR/instructions/oreki_boot.txt" "折木"

    sleep 3

    # キョン（Sonnet）— bushitsu pane 2
    launch_agent "${BUSHITSU_SESSION}.2" "claude-sonnet-4-5-20250929" \
        "$BASEDIR/instructions/kyon_boot.txt" "キョン"

    sleep 3

    sleep 5  # Sonnet→Opus

    # 長門（Opus）— bushitsu pane 3
    launch_agent "${BUSHITSU_SESSION}.3" "claude-opus-4-6" \
        "$BASEDIR/instructions/nagato_boot.txt" "長門"

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
            setup_sessions
            echo ""
            gum style --foreground 240 --italic "  部室の鍵を開けました（まだ誰も来てません）"
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
            setup_sessions
            launch_claude
            sleep 5
            launch_workers
            ;;
        normal)
            setup_sessions
            launch_claude
            ;;
    esac

    echo ""
}

main "$@"
