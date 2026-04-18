#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# toshoshitsu.sh — 薄氷図書室 URL取り込み（摩耶花を呼び出す）
#=============================================================================
# Usage:
#   ./toshoshitsu.sh           キューの未処理URLを摩耶花が処理する
#   ./toshoshitsu.sh -l        キューの未処理URL一覧を表示する
#=============================================================================

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
QUEUE_FILE="$BASEDIR/queue/toshoshitsu_queue.yaml"

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
    if ! command -v claude &>/dev/null; then
        error "claude (Claude Code CLI) がインストールされていません"
        exit 1
    fi
    if [[ ! -f "$QUEUE_FILE" ]]; then
        echo "urls: []" > "$QUEUE_FILE"
    fi
}

# --- 未処理件数カウント（grep方式・外部依存なし） ---
count_pending() {
    local c
    c=$(grep -c 'status: pending' "$QUEUE_FILE" 2>/dev/null) || true
    echo "${c:-0}"
}

# --- キュー一覧表示 ---
list_queue() {
    local count
    count=$(count_pending)
    if [[ "$count" == "0" ]]; then
        maya "返却待ちの本はないわよ"
        return
    fi
    echo ""
    gum style --foreground 213 --bold "  📋 返却待ち: ${count}件"
    echo ""
    grep -B1 'status: pending' "$QUEUE_FILE" | grep 'url:' | sed 's/.*url: //' | while read -r url; do
        gum style --foreground 240 "     $url"
    done
}

# --- 部会稼働チェック ---
check_bukatsu_active() {
    if tmux has-session -t keijiban 2>/dev/null || tmux has-session -t bushitsu 2>/dev/null; then
        return 0  # 稼働中
    fi
    return 1  # 停止中
}

# --- 摩耶花起動（リトライ付き） ---
run_mayaka() {
    check_prerequisites

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

    # リトライループ（最大3回）
    local max_retries=3
    local attempt=1
    local result

    while [[ $attempt -le $max_retries ]]; do
        # 摩耶花を非対話モードで起動（Haiku: 軽量＆低コスト）
        result=$(cd "$BASEDIR" && claude --model claude-haiku-4-5-20251001 \
            --dangerously-skip-permissions \
            --max-turns 15 \
            -p "$(cat <<'PROMPT'
あなたは伊原摩耶花。薄氷図書館の図書委員。

## タスク
MCPツール `get_toshoshitsu_queue` で未処理（pending）のURLを取得し、各URLを以下の手順で処理してください。

## 各URLの処理手順
1. WebFetchツールでURLの内容を取得する
2. `search_obsidian` で既に同じ内容が登録されていないか確認する（category: "library"）
3. キューの `note` フィールドに投稿者のひとことがある場合、タグ選定のヒントにする
4. 以下の構造で要約する:
   ```
   ## ひとこと
   > （noteがあればここに引用。なければこのセクション省略）

   ## 概要
   （1-3文で何の記事/ドキュメントか）

   ## ポイント
   - 重要なポイントを箇条書き（3-7個）

   ## 使い方・適用場面
   - どういう時に役立つか

   ## 出典
   - [タイトル](URL)
   ```
5. 適切なタグを付ける（ひとことメモも参考にする）:
   - 技術系: TypeScript, React, Node.js, Python, Go, Rust 等
   - 分野系: アーキテクチャ, セキュリティ, パフォーマンス, テスト, CI-CD 等
   - 種別系: 公式ドキュメント, テックブログ, チュートリアル, リファレンス 等
5. `save_to_obsidian` で保存（category: "library"）
6. `update_toshoshitsu_queue` でURLのstatusを "done" にする
7. 次のURLへ

## 各URL処理後の報告（1件ごとに出力）
以下のフォーマットで報告する:

```
📚 「（タイトル）」
   タグ: #○○ #○○ #○○
   概要: （1文で何の記事か）
   関連: （関連ノートがあれば。なければ省略）
   → 開架に入れたわよ。（記事の内容に対する摩耶花らしいひとこと感想）
```

「→」の行には、保存完了の報告に加えて記事を読んだ感想を一言添える。
感想は摩耶花の口調で、記事の具体的な中身に触れること。褒め・ツッコミ・実用性への言及など自由に。
例:
- 「→ 開架に入れたわよ。設計思想がしっかりしてて、UIライブラリの手本みたいな記事ね。」
- 「→ 開架に入れたわよ。Hooksの使い方が独特で面白いけど、初心者には向かないわね。」
- 「→ 開架に入れたわよ。これ地味に実務で使えるやつ。覚えておきなさい。」

失敗した場合:
```
❌ （URL）
   理由: （失敗理由）
```

## 全URL処理後
処理件数のまとめと一言。口調は摩耶花らしく。
例: 「3件整理したわよ。ちゃんとタグ付けしておいたから、後で検索できるわ。」
PROMPT
)" 2>&1) || true

        # レート制限チェック
        if echo "$result" | grep -qi 'credit balance\|rate limit\|too many requests\|overloaded'; then
            if [[ $attempt -lt $max_retries ]]; then
                local wait_sec=$(( attempt * 30 ))
                maya "混んでるわね...${wait_sec}秒待つわよ（${attempt}/${max_retries}回目）"
                sleep "$wait_sec"
                attempt=$(( attempt + 1 ))
                continue
            else
                echo "$result"
                echo ""
                maya "何回やってもダメ。部室が落ち着いてからにして"
                echo ""
                exit 1
            fi
        fi

        # 成功
        echo "$result"
        break
    done

    echo ""
    line
    echo ""
}

# --- メイン ---
main() {
    check_prerequisites

    case "${1:-}" in
        -l|--list)
            list_queue
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "  (なし)    摩耶花を起動してキューを処理する"
            echo "  -l        未処理URL一覧を表示する"
            echo "  -h        ヘルプを表示する"
            ;;
        *)
            run_mayaka
            ;;
    esac
}

main "$@"
