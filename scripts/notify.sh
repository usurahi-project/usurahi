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
#
# 送信は herdr の agent.prompt を使う。宛先はペイン番号ではなく名前で解決され、
# 改行・引用符・記号はそのまま届く。送信先が未起動なら起動してブートまで行う。
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")/.." && pwd)"

exec node "$BASEDIR/scripts/herdr.mjs" notify "$@"
