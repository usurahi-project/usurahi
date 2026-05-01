#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# notify.sh — 連絡網（エージェント間メッセージ送信）
#=============================================================================
# Usage:
#   ./scripts/notify.sh <送信先> <メッセージ>
#
# 送信先: eru, haruhi, oreki, kyon, nagato
#
# Examples:
#   ./scripts/notify.sh eru "タスク完了しました"
#   ./scripts/notify.sh haruhi "レビューお願いします"
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCKDIR="$BASEDIR/queue/.lock"
STALE_SECONDS=30
CLAUDE_BIN="$BASEDIR/scripts/claude-app.sh"

# --- ペイン解決 ---
resolve_pane() {
    local target="$1"
    case "$target" in
        eru)     echo "noticeboard.0" ;;
        haruhi)  echo "clubroom.0" ;;
        oreki)   echo "clubroom.1" ;;
        kyon)    echo "clubroom.3" ;;
        nagato)  echo "clubroom.5" ;;
        *)
            echo "エラー: 不明な送信先 '$target'" >&2
            echo "  使用可能: eru, haruhi, oreki, kyon, nagato" >&2
            exit 1
            ;;
    esac
}

# --- アトミックロック（mkdir方式・macOS互換） ---
acquire_lock() {
    local max_attempts=20
    local attempt=0

    while ! mkdir "$LOCKDIR" 2>/dev/null; do
        # ステールロック検出
        if [[ -d "$LOCKDIR" ]]; then
            local lock_time
            lock_time=$(stat -f %m "$LOCKDIR" 2>/dev/null || echo 0)
            local now
            now=$(date +%s)
            local age=$(( now - lock_time ))

            if [[ $age -gt $STALE_SECONDS ]]; then
                rm -rf "$LOCKDIR"
                continue
            fi
        fi

        attempt=$(( attempt + 1 ))
        if [[ $attempt -ge $max_attempts ]]; then
            echo "エラー: ロック取得タイムアウト" >&2
            exit 1
        fi

        sleep 0.1
    done

    # ロック取得成功時にPIDを記録
    echo $$ > "$LOCKDIR/pid"
}

release_lock() {
    rm -rf "$LOCKDIR"
}

# --- モデル・ブートファイル解決 ---
resolve_model() {
    case "$1" in
        eru) echo "claude-opus-4-6" ;;
        *)   echo "claude-sonnet-4-5-20250929" ;;
    esac
}

resolve_boot() {
    case "$1" in
        eru)     echo "$BASEDIR/instructions/eru_boot.txt" ;;
        haruhi)  echo "$BASEDIR/instructions/haruhi_boot.txt" ;;
        oreki)   echo "$BASEDIR/instructions/oreki_boot.txt" ;;
        kyon)    echo "$BASEDIR/instructions/kyon_boot.txt" ;;
        nagato)  echo "$BASEDIR/instructions/nagato_boot.txt" ;;
    esac
}

# --- Claude Code 起動チェック＆自動起動 ---
ensure_running() {
    local target="$1"
    local pane="$2"

    # ❯ プロンプトがあれば起動済み
    local content
    content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
    if echo "$content" | grep -q '❯'; then
        return 0
    fi

    # シェルプロンプトだけなら未起動 → 自動起動
    local model boot_file
    model=$(resolve_model "$target")
    boot_file=$(resolve_boot "$target")

    if [[ ! -f "$boot_file" ]]; then
        return 0  # ブートファイルなければスキップ
    fi

    # 既存の入力をクリアしてからClaude Codeを起動
    tmux send-keys -t "$pane" C-c
    sleep 0.3
    tmux send-keys -t "$pane" C-u
    sleep 0.3
    tmux send-keys -t "$pane" "$CLAUDE_BIN --model $model --dangerously-skip-permissions" Enter

    # プロンプト待ち（最大45秒）
    local waited=0
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
            sleep 3
        fi

        if echo "$pane_content" | grep -q '❯'; then
            # ブートプロンプト送信
            local boot_text
            boot_text=$(cat "$boot_file")
            tmux send-keys -t "$pane" -l "$boot_text"
            tmux send-keys -t "$pane" Enter
            # ブート完了を待つ
            sleep 5
            return 0
        fi
    done
}

# --- メッセージ送信 ---
send_message() {
    local target="$1"
    local message="$2"
    local pane

    pane=$(resolve_pane "$target")

    # 送信先が未起動なら自動起動
    ensure_running "$target" "$pane"

    # 起動完了後、プロンプトを待つ
    local waited=0
    while [[ $waited -lt 60 ]]; do
        local content
        content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
        if echo "$content" | grep -q '❯'; then
            break
        fi
        sleep 2
        waited=$(( waited + 2 ))
    done

    # 改行をスペースに変換（send-keys -l は改行をそのまま Enter として送るため、
    # 意図しない中間送信が発生する。メッセージは1行に正規化する）
    message=$(echo "$message" | tr '\n' ' ' | sed 's/  */ /g')

    # 既存の入力をクリアしてからメッセージ送信
    tmux send-keys -t "$pane" C-u
    sleep 0.2

    # tmuxペインにメッセージ送信（-l でリテラル送信、特殊文字の干渉を防ぐ）
    # Claude Codeのプロンプトに直接入力する
    tmux send-keys -t "$pane" -l "$message"
    tmux send-keys -t "$pane" Enter
}

# --- メイン ---
main() {
    if [[ $# -lt 2 ]]; then
        echo "Usage: $0 <送信先> <メッセージ>"
        echo "  送信先: eru, haruhi, oreki, kyon, nagato"
        exit 1
    fi

    local target="$1"
    shift
    local message="$*"

    # ロック取得 → 送信 → ロック解放
    acquire_lock
    trap release_lock EXIT

    send_message "$target" "$message"
}

main "$@"
