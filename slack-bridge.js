#!/usr/bin/env node
"use strict";

/**
 * 薄氷図書室 Slack Bridge
 *
 * Slack は図書室の主線入口ではない。
 * 受け取った入力を `library.sh add` に流し込む補助アダプタとして扱う。
 *
 * :tosyositsu: スタンプ → URLを図書室カウンターに積む
 * @薄氷図書室 メンション → URL投入またはナレッジ検索
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

function requireEnv(name) {
  if (process.env[name]) {
    return;
  }

  throw new Error(
    `${name} is not set. Copy .env.example to .env and fill the Slack app values.`
  );
}

function isXUrl(url) {
  try {
    const parsed = new URL(url);
    return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

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
  note = note.replace(/<[^>]*>/g, "").trim();
  return note || null;
}

// --- ANSI strip ---
function stripAnsi(str) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

function formatQueueReply(url, output) {
  const cleaned = String(output || "").trim();

  if (cleaned.includes("すでにカウンターにある")) {
    return [
      "その本、前にも預かってるわよ。",
      "いまこちらで見ているところだから、同じものを何度も出さなくていいわ。",
      "片づいたら、このスレッドに戻るわね。",
    ].filter(Boolean).join("\n\n");
  }

  if (cleaned.includes("図書室カウンターに追加")) {
    const noteMatch = cleaned.match(/ひとこと:\s*(.+)/);
    return [
      "預かったわ。棚に入れる前に、ちゃんと目を通しておくわね。",
      noteMatch ? `ひとこと\n${noteMatch[1]}` : "",
      "整理が済んだら、このスレッドに戻るわね。",
    ].filter(Boolean).join("\n\n");
  }

  if (cleaned) {
    return cleaned;
  }

  return "うまく受け取れなかったわ。もう一回見せてちょうだい。";
}

function triggerLibraryRun() {
  return new Promise((resolve) => {
    execFile(
      path.join(__dirname, "scripts", "launch-library-run.sh"),
      [],
      {
        cwd: __dirname,
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:${process.env.PATH}`,
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          const errorOutput = stripAnsi(stderr || stdout || err.message || "").trim();
          console.error("triggerLibraryRun failed:", err.message, errorOutput);
          resolve({
            ok: false,
            message: errorOutput || "整理を起動できなかったわ。少ししてからもう一度見せてちょうだい。",
          });
          return;
        }

        resolve({ ok: true });
      }
    );
  });
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

// --- 図書室の主線入口へ投入 ---
function enqueueLibrary(url, note, slackChannel, slackThreadTs) {
  return new Promise((resolve) => {
    if (isXUrl(url)) {
      resolve([
        `${url}`,
        "X 投稿は Slack からは主線に乗せないわ。",
        "`./library.sh add <x-url> --excerpt \"抜粋本文\"` で図書室カウンターに入れて。",
      ].join("\n"));
      return;
    }

    const args = ["add", url];
    if (note) {
      args.push("--note", note);
    }
    if (slackChannel) {
      args.push("--slack-channel", slackChannel);
    }
    if (slackThreadTs) {
      args.push("--slack-thread-ts", slackThreadTs);
    }
    execFile(
      path.join(__dirname, "library.sh"),
      args,
      { cwd: __dirname, timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } },
      (err, stdout, stderr) => {
        const output = stripAnsi(stdout || "").trim();
        const errorOutput = stripAnsi(stderr || "").trim();
        if (err) {
          console.error("enqueueLibrary failed:", err.message, errorOutput);
          resolve(
            output ||
              errorOutput ||
              `${url}\n理由: 図書室カウンターへの投入に失敗したわ。`
          );
        } else {
          resolve(formatQueueReply(url, output));
        }
      }
    );
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reaction handler: :tosyositsu: → 主線入口へ投入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.event("reaction_added", async ({ event, client }) => {
  console.log("reaction_added received", {
    reaction: event.reaction,
    channel: event.item?.channel,
    ts: event.item?.ts,
  });
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
      text: `${urls.length}件ね。預かるわ。いまから見るから少し待ってなさい。`,
      thread_ts: event.item.ts,
    });

    for (const url of urls) {
      const processed = await enqueueLibrary(url, note, CHANNEL_ID, event.item.ts);
      await client.chat.postMessage({
        channel: CHANNEL_ID,
        text: processed,
        thread_ts: event.item.ts,
      });
    }

    const runResult = await triggerLibraryRun();
    if (!runResult.ok) {
      await client.chat.postMessage({
        channel: CHANNEL_ID,
        text: [
          "預かりまではできたんだけど、整理を起動できなかったわ。",
          runResult.message,
        ].join("\n"),
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
  console.log("app_mention received", {
    channel: event.channel,
    ts: event.ts,
    thread_ts: event.thread_ts || null,
    text: event.text,
  });
  const text = event.text.replace(/<@[A-Z0-9]+>/gi, "").trim();
  const thread_ts = event.thread_ts || event.ts;

  try {
    const urls = extractUrls(text);

    // --- URL付き → 主線入口へ投入 ---
    if (urls.length > 0) {
      const note = extractNote(text, urls);
      await client.chat.postMessage({
        channel: event.channel,
        text: `${urls.length}件ね。預かるわ。いまから見るから少し待ってなさい。`,
        thread_ts,
      });

      for (const url of urls) {
        const result = await enqueueLibrary(url, note, event.channel, thread_ts);
        await client.chat.postMessage({
          channel: event.channel,
          text: result,
          thread_ts,
        });
      }

      const runResult = await triggerLibraryRun();
      if (!runResult.ok) {
        await client.chat.postMessage({
          channel: event.channel,
          text: [
            "預かりまではできたんだけど、整理を起動できなかったわ。",
            runResult.message,
          ].join("\n"),
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
          "• URL付き → 図書室カウンターに積む",
          '• 「〇〇 調べて」→ ナレッジ検索',
          "• :tosyositsu: スタンプ → URL付きメッセージをカウンターへ投入",
          "• X 投稿は `library.sh add <x-url> --excerpt ...` が主線",
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

app.error((error) => {
  console.error("slack app error:", error);
});

// --- 起動 ---
(async () => {
  requireEnv("SLACK_BOT_TOKEN");
  requireEnv("SLACK_APP_TOKEN");
  requireEnv("SLACK_CHANNEL_ID");

  await app.start();
  console.log("📚 薄氷図書室 Slack Bridge 起動");
  console.log(`   チャンネル: ${CHANNEL_ID}`);
  console.log(`   トリガー絵文字: :${TRIGGER_EMOJI}:`);
  console.log("   メンション対応: 有効");
  console.log("   役割: library.sh add への補助アダプタ");
})();
