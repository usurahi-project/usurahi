#!/usr/bin/env node
"use strict";

/**
 * 薄氷図書室 Slack Bridge
 *
 * :tosyositsu: スタンプ → URLを摩耶花が即時処理
 * @薄氷図書室 メンション → 摩耶花が即時対応
 *   - URL付き → 記事を処理してObsidianに保存
 *   - 「〇〇 調べて」→ Obsidian検索
 */

const { App } = require("@slack/bolt");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const CHANNEL_ID = process.env.SLACK_CHANNEL_ID || "C0A77HADF0F";
const TRIGGER_EMOJI = process.env.TRIGGER_EMOJI || "tosyositsu";
const OBSIDIAN_USURAHI = path.join(
  process.env.HOME,
  "Documents",
  "Obsidian Vault",
  "薄氷"
);
const OBSIDIAN_FOLDERS = {
  archive: "図書館/薄氷バックナンバー",
  activity_log: "部室/活動記録",
  library: "図書館/開架",
};

// --- Slack App (Socket Mode) ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// --- URL extraction ---
function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s>|]+/g;
  return text.match(urlRegex) || [];
}

function extractNote(text, urls) {
  let note = text;
  for (const url of urls) {
    note = note.replace(url, "");
  }
  note = note.replace(/<[^>]+>/g, "").trim();
  return note || null;
}

// --- ANSI strip ---
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

// --- Obsidian search ---
function searchObsidian(query) {
  const results = [];
  for (const [cat, folder] of Object.entries(OBSIDIAN_FOLDERS)) {
    const dir = path.join(OBSIDIAN_USURAHI, folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const lowerQuery = query.toLowerCase();
      if (
        file.toLowerCase().includes(lowerQuery) ||
        content.toLowerCase().includes(lowerQuery)
      ) {
        const lines = content.split("\n");
        const matchLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            matchLines.push(lines[i].substring(0, 100));
            if (matchLines.length >= 3) break;
          }
        }
        results.push({
          title: file.replace(".md", ""),
          category: cat,
          matches:
            matchLines.length > 0 ? matchLines : ["(ファイル名マッチ)"],
        });
      }
    }
  }
  return results;
}

// --- 検索クエリ抽出 ---
function extractSearchQuery(text) {
  return text
    .replace(
      /(調べて|検索して|検索|探して|知ってる[？?]?|ある[？?]?|ナレッジ|について|を|は|に|て|で|くれ|教えて|って)/g,
      ""
    )
    .trim();
}

// --- 摩耶花: URL単体を即時処理 ---
function processUrl(url, note) {
  return new Promise((resolve) => {
    const noteSection = note ? `\n投稿者メモ: ${note}` : "";
    const prompt = `あなたは伊原摩耶花。薄氷図書館の図書委員。

以下のURLを薄氷図書館に保存して。

URL: ${url}${noteSection}

## 手順
1. WebFetchでURL内容を取得
2. search_obsidian で重複確認（category: "library"）
3. 以下の構造で要約:
   ## ひとこと
   > （投稿者メモがあれば引用。なければ省略）
   ## 概要
   （1-3文）
   ## ポイント
   - 箇条書き（3-7個）
   ## 使い方・適用場面
   - どういう時に役立つか
   ## 出典
   - [タイトル](URL)
4. タグ付け（投稿者メモも参考に）:
   - 技術系: TypeScript, React, Node.js, Python, Go, Rust 等
   - 分野系: アーキテクチャ, セキュリティ, パフォーマンス, テスト, CI-CD 等
   - 種別系: 公式ドキュメント, テックブログ, チュートリアル, リファレンス 等
5. save_to_obsidian で保存（category: "library"）

## 報告（この形式だけを出力して。余計な説明は不要）
📚 「（タイトル）」
   タグ: #○○ #○○ #○○
   概要: （1文で何の記事か）
   → 開架に入れたわよ。（記事への摩耶花らしいひとこと感想）

重複していた場合:
📚 「（タイトル）」→ もう登録済みよ。

失敗した場合:
❌ （URL）
   理由: （失敗理由）`;

    execFile(
      "/opt/homebrew/bin/claude",
      [
        "--model", "claude-haiku-4-5-20251001",
        "--dangerously-skip-permissions",
        "--max-turns", "10",
        "-p", prompt,
      ],
      { cwd: __dirname, timeout: 180000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } },
      (err, stdout) => {
        const output = stripAnsi(stdout || "").trim();
        if (err) {
          if (
            output.match(
              /credit balance|rate limit|too many requests|overloaded/i
            )
          ) {
            resolve(
              "レート制限に引っかかったわ。少し時間を置いてからまた呼んで。"
            );
          } else {
            console.error("processUrl failed:", err.message);
            resolve(output || `❌ ${url}\n   理由: 処理中にエラーが出たわ。`);
          }
        } else {
          resolve(output || "処理完了よ。");
        }
      }
    );
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reaction handler: :tosyositsu: → 即時処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.event("reaction_added", async ({ event, client }) => {
  if (event.reaction !== TRIGGER_EMOJI) return;
  if (event.item.channel !== CHANNEL_ID) return;

  try {
    const result = await client.conversations.replies({
      channel: event.item.channel,
      ts: event.item.ts,
      limit: 1,
      inclusive: true,
    });

    const message = result.messages && result.messages[0];
    if (!message || !message.text) return;

    const text = message.text;
    const urls = extractUrls(text);

    if (urls.length === 0) {
      await client.chat.postMessage({
        channel: CHANNEL_ID,
        text: "URLが見つからないわよ。",
        thread_ts: event.item.ts,
      });
      return;
    }

    const note = extractNote(text, urls);
    await client.chat.postMessage({
      channel: CHANNEL_ID,
      text: `${urls.length}件ね。整理するから待ってなさい。`,
      thread_ts: event.item.ts,
    });

    for (const url of urls) {
      const processed = await processUrl(url, note);
      await client.chat.postMessage({
        channel: CHANNEL_ID,
        text: processed,
        thread_ts: event.item.ts,
      });
    }
  } catch (err) {
    console.error("reaction handler error:", err.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mention handler: @薄氷図書室 → 摩耶花対応
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.event("app_mention", async ({ event, client }) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
  const thread_ts = event.thread_ts || event.ts;

  try {
    const urls = extractUrls(text);

    // --- URL付き → 即時処理 ---
    if (urls.length > 0) {
      const note = extractNote(text, urls);
      await client.chat.postMessage({
        channel: event.channel,
        text: `${urls.length}件ね。整理するから待ってなさい。`,
        thread_ts,
      });

      for (const url of urls) {
        const result = await processUrl(url, note);
        await client.chat.postMessage({
          channel: event.channel,
          text: result,
          thread_ts,
        });
      }

      // --- 「〇〇 調べて」→ Obsidian検索 ---
    } else if (text.match(/調べ|検索|知って|探し|ナレッジ/)) {
      const query = extractSearchQuery(text);
      if (!query) {
        await client.chat.postMessage({
          channel: event.channel,
          text: "何を調べればいいの？キーワードを書いて。",
          thread_ts,
        });
        return;
      }

      const results = searchObsidian(query);
      if (results.length === 0) {
        await client.chat.postMessage({
          channel: event.channel,
          text: `「${query}」に一致するノートは見つからなかったわ。`,
          thread_ts,
        });
      } else {
        const formatted = results
          .slice(0, 5)
          .map(
            (r) =>
              `📖 *${r.title}* (${r.category})\n${r.matches.map((m) => `> ${m}`).join("\n")}`
          )
          .join("\n\n");
        await client.chat.postMessage({
          channel: event.channel,
          text: `${results.length}件見つけたわよ:\n\n${formatted}`,
          thread_ts,
        });
      }

      // --- ヘルプ ---
    } else {
      await client.chat.postMessage({
        channel: event.channel,
        text: [
          "何？用があるならちゃんと言いなさい。",
          "",
          "• URL付き → 記事を読んで図書館に保存",
          '• 「〇〇 調べて」→ ナレッジ検索',
          "• :tosyositsu: スタンプ → URL付きメッセージにスタンプで即保存",
        ].join("\n"),
        thread_ts,
      });
    }
  } catch (err) {
    console.error("mention handler error:", err.message);
    await client.chat
      .postMessage({
        channel: event.channel,
        text: `エラーが出たわ: ${err.message}`,
        thread_ts,
      })
      .catch(() => {});
  }
});

// --- 起動 ---
(async () => {
  await app.start();
  console.log("📚 薄氷図書室 Slack Bridge 起動");
  console.log(`   チャンネル: ${CHANNEL_ID}`);
  console.log(`   トリガー絵文字: :${TRIGGER_EMOJI}:`);
  console.log("   メンション対応: 有効");
})();
