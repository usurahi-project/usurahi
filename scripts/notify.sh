#!/usr/bin/env bash
set -euo pipefail

BASEDIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCKDIR="$BASEDIR/queue/.lock"
STALE_SECONDS=30

resolve_pane() {
    local target="$1"
    case "$target" in
        eru)     echo "noticeboard.0" ;;
        haruhi)  echo "clubroom.0" ;;
        oreki)   echo "clubroom.1" ;;
        kyon)    echo "clubroom.2" ;;
        nagato)  echo "clubroom.3" ;;
        *)
            echo "エラー: 不明な送信先 '$target'" >&2
            echo "  使用可能: eru, haruhi, oreki, kyon, nagato" >&2
            exit 1
            ;;
    esac
}

acquire_lock() {
    local max_attempts=20
    local attempt=0

    while ! mkdir "$LOCKDIR" 2>/dev/null; do
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

    echo $$ > "$LOCKDIR/pid"
}

release_lock() {
    rm -rf "$LOCKDIR"
}

resolve_model() {
    case "$1" in
        eru|haruhi|nagato) echo "claude-opus-4-6" ;;
        *)                 echo "claude-sonnet-4-5-20250929" ;;
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

ensure_running() {
    local target="$1"
    local pane="$2"

    local content
    content=$(tmux capture-pane -t "$pane" -p -S -5 2>/dev/null || true)
    if echo "$content" | grep -q '❯'; then
        return 0
    fi

    local model boot_file
    model=$(resolve_model "$target")
    boot_file=$(resolve_boot "$target")

    if [[ ! -f "$boot_file" ]]; then
        return 0
    fi

    tmux send-keys -t "$pane" C-c
    sleep 0.3
    tmux send-keys -t "$pane" C-u
    sleep 0.3
    tmux send-keys -t "$pane" "claude --model $model --dangerously-skip-permissions" Enter

    local waited=0
    while [[ $waited -lt 45 ]]; do
        sleep 2
        waited=$(( waited + 2 ))
        local pane_content
        pane_content=$(tmux capture-pane -t "$pane" -p -S -10 2>/dev/null || true)

        if echo "$pane_content" | grep -q "Yes, I accept"; then
            tmux send-keys -t "$pane" Down
            sleep 0.3
            tmux send-keys -t "$pane" Enter
            sleep 3
        fi

        if echo "$pane_content" | grep -q '❯'; then
            local boot_text
            boot_text=$(cat "$boot_file")
            tmux send-keys -t "$pane" -l "$boot_text"
            tmux send-keys -t "$pane" Enter
            sleep 5
            return 0
        fi
    done
}

send_message() {
    local target="$1"
    local message="$2"
    local pane

    pane=$(resolve_pane "$target")
    ensure_running "$target" "$pane"

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

    message=$(echo "$message" | tr '\n' ' ' | sed 's/  */ /g')
    tmux send-keys -t "$pane" C-u
    sleep 0.2
    tmux send-keys -t "$pane" -l "$message"
    tmux send-keys -t "$pane" Enter
}

main() {
    if [[ $# -lt 2 ]]; then
        echo "Usage: $0 <送信先> <メッセージ>"
        echo "  送信先: eru, haruhi, oreki, kyon, nagato"
        exit 1
    fi

    local target="$1"
    shift
    local message="$*"

    acquire_lock
    trap release_lock EXIT

    send_message "$target" "$message"
}

main "$@"
