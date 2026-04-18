#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# meeting.sh — 薄氷（うすらひ）起動スクリプト
#=============================================================================
# Usage:
#   ./meeting.sh          通常起動（える＋ハルヒのみ）
#   ./meeting.sh -w       部員召集（折木・キョン・長門を起動）
#   ./meeting.sh -a       全員起動（える＋ハルヒ＋部員3名を一括起動）
#   ./meeting.sh -s       セットアップのみ（tmuxセッション作成、Claude起動なし）
#   ./meeting.sh -c       クリーン起動（キューをリセットしてから起動）
#   ./meeting.sh -k       終了（tmuxセッションを閉じる）
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
NOTICEBOARD_SESSION="noticeboard"
CLUBROOM_SESSION="clubroom"

dim()    { gum style --foreground 240 "  $1"; }
ok()     { gum style --foreground 76 "  ✓ $1"; }
warn()   { gum style --foreground 214 "  ⚠ $1"; }
error()  { gum style --foreground 196 "  ✗ $1" >&2; }

wareki_date() {
    local m d
    m=$(date +%-m)
    d=$(date +%-d)
    local -a months=("" "睦月" "如月" "弥生" "卯月" "皐月" "水無月" "文月" "葉月" "長月" "神無月" "霜月" "師走")
    local -a kanji=("" "一" "二" "三" "四" "五" "六" "七" "八" "九" "十" "十一" "十二" "十三" "十四" "十五" "十六" "十七" "十八" "十九" "二十" "二十一" "二十二" "二十三" "二十四" "二十五" "二十六" "二十七" "二十八" "二十九" "三十" "三十一")
    echo "${months[$m]}${kanji[$d]}日"
}

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

reset_queues() {
    dim "キューをリセットしています..."

    cat > "$BASEDIR/queue/noticeboard.yaml" << 'YAML'
posts: []
YAML
    cp "$BASEDIR/queue/noticeboard.yaml" "$BASEDIR/queue/keijiban.yaml"

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

    cat > "$BASEDIR/queue/library_queue.yaml" << 'YAML'
urls: []
YAML
    cp "$BASEDIR/queue/library_queue.yaml" "$BASEDIR/queue/toshoshitsu_queue.yaml"

    cat > "$BASEDIR/blackboard.md" << 'MD'
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
    cp "$BASEDIR/blackboard.md" "$BASEDIR/kokuban.md"

    dim "キューリセット完了"
}

kill_sessions() {
    dim "既存セッションを終了しています..."
    tmux kill-session -t "$NOTICEBOARD_SESSION" 2>/dev/null && dim "  $NOTICEBOARD_SESSION 終了" || true
    tmux kill-session -t "$CLUBROOM_SESSION" 2>/dev/null && dim "  $CLUBROOM_SESSION 終了" || true
    tmux kill-session -t "keijiban" 2>/dev/null && dim "  keijiban 終了" || true
    tmux kill-session -t "bushitsu" 2>/dev/null && dim "  bushitsu 終了" || true
}

setup_sessions() {
    kill_sessions

    dim "tmuxセッションを作成しています..."

    tmux new-session -d -s "$NOTICEBOARD_SESSION" -c "$BASEDIR" -x 200 -y 50
    tmux set-option -t "$NOTICEBOARD_SESSION" pane-border-format " える（副部長・連絡役） "
    tmux set-option -t "$NOTICEBOARD_SESSION" pane-border-status top
    dim "  noticeboard セッション作成（える）"

    tmux new-session -d -s "$CLUBROOM_SESSION" -c "$BASEDIR" -x 200 -y 50
    tmux set-option -t "$CLUBROOM_SESSION" pane-base-index 0

    tmux split-window -t "${CLUBROOM_SESSION}" -h -c "$BASEDIR"
    tmux split-window -t "${CLUBROOM_SESSION}" -v -c "$BASEDIR"
    tmux split-window -t "${CLUBROOM_SESSION}" -v -c "$BASEDIR"

    tmux select-pane -t "${CLUBROOM_SESSION}.0" -T "ハルヒ（部長）"
    tmux select-pane -t "${CLUBROOM_SESSION}.1" -T "折木（部員）"
    tmux select-pane -t "${CLUBROOM_SESSION}.2" -T "キョン（部員）"
    tmux select-pane -t "${CLUBROOM_SESSION}.3" -T "長門（部員）"

    tmux set-option -t "$CLUBROOM_SESSION" pane-border-format " #{pane_title} "
    tmux set-option -t "$CLUBROOM_SESSION" pane-border-status top
    tmux select-layout -t "$CLUBROOM_SESSION" tiled

    dim "  clubroom ペインマッピング:"
    for i in 0 1 2 3; do
        local title
        title=$(tmux display-message -t "${CLUBROOM_SESSION}.${i}" -p '#{pane_title}' 2>/dev/null || echo "???")
        dim "    pane $i → $title"
    done
}

launch_claude() {
    dim "Claude Code を起動しています..."

    local common_flags="--dangerously-skip-permissions"

    detect_prompt() {
        local pane="$1"
        local content
        content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
        echo "$content" | grep -q '❯'
    }

    launch_agent() {
        local pane="$1"
        local model="$2"
        local boot_file="$3"
        local name="$4"

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
            warn "${name}: プロンプト待ちタイムアウト（手動確認推奨）"
            return
        fi

        local boot_text
        boot_text=$(cat "$boot_file")
        tmux send-keys -t "$pane" -l "$boot_text"
        tmux send-keys -t "$pane" Enter
        dim "    ${name}: ブート完了"
        sleep 1
    }

    launch_agent "${NOTICEBOARD_SESSION}.0" "claude-opus-4-6" "$BASEDIR/instructions/eru_boot.txt" "える"
    launch_agent "${CLUBROOM_SESSION}.0" "claude-opus-4-6" "$BASEDIR/instructions/haruhi_boot.txt" "ハルヒ"
}

show_ready() {
    echo ""
    ok "起動完了"
    echo ""
    gum style --foreground 240 "  えるに話す  $(gum style --foreground 123 'tmux attach -t noticeboard')"
    gum style --foreground 240 "  部室を覗く  $(gum style --foreground 123 'tmux attach -t clubroom')"
    gum style --foreground 240 "  部員を呼ぶ  $(gum style --foreground 123 '~/usurahi/meeting.sh -w')"
    echo ""
}

call_members() {
    check_prerequisites
    dim "部員を呼んでいます..."

    if ! tmux has-session -t "$CLUBROOM_SESSION" 2>/dev/null; then
        error "clubroom セッションがありません。先に meeting.sh を実行してください"
        exit 1
    fi

    detect_prompt() {
        local pane="$1"
        local content
        content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
        echo "$content" | grep -q '❯'
    }

    launch_agent() {
        local pane="$1"
        local model="$2"
        local boot_file="$3"
        local name="$4"

        if detect_prompt "$pane"; then
            dim "    ${name}: 既に起動済み"
            return
        fi

        tmux send-keys -t "$pane" "claude --model $model --dangerously-skip-permissions" Enter

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
            warn "${name}: プロンプト待ちタイムアウト（手動確認推奨）"
            return
        fi

        local boot_text
        boot_text=$(cat "$boot_file")
        tmux send-keys -t "$pane" -l "$boot_text"
        tmux send-keys -t "$pane" Enter
        dim "    ${name}: ブート完了"
        sleep 1
    }

    launch_agent "${CLUBROOM_SESSION}.1" "claude-sonnet-4-5-20250929" "$BASEDIR/instructions/oreki_boot.txt" "折木"
    launch_agent "${CLUBROOM_SESSION}.2" "claude-sonnet-4-5-20250929" "$BASEDIR/instructions/kyon_boot.txt" "キョン"
    launch_agent "${CLUBROOM_SESSION}.3" "claude-opus-4-6" "$BASEDIR/instructions/nagato_boot.txt" "長門"

    echo ""
    ok "部員召集完了"
    echo ""
}

main() {
    local mode="${1:-}"

    case "$mode" in
        -k)
            kill_sessions
            ok "終了しました"
            exit 0
            ;;
        -c)
            show_blackboard
            echo ""
            check_prerequisites
            reset_queues
            setup_sessions
            launch_claude
            show_ready
            ;;
        -w)
            call_members
            ;;
        -a)
            show_blackboard
            echo ""
            check_prerequisites
            reset_queues
            setup_sessions
            launch_claude
            call_members
            show_ready
            ;;
        -s)
            show_blackboard
            echo ""
            check_prerequisites
            setup_sessions
            ok "セッション作成完了（Claude未起動）"
            ;;
        *)
            show_blackboard
            echo ""
            check_prerequisites
            setup_sessions
            launch_claude
            show_ready
            ;;
    esac
}

main "$@"
