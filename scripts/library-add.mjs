#!/usr/bin/env node

import "dotenv/config";
import { loadPendingQueue, savePendingQueue } from "./library-queue-store.mjs";
const VALID_INTENTS = new Set(["interesting", "try-soon", "keep-for-later"]);

function parseArgs(argv) {
  const args = [...argv];
  let url = "";
  let note = "";
  let intent = "";
  let excerpt = "";
  let slackChannel = "";
  let slackThreadTs = "";

  while (args.length > 0) {
    const token = args.shift();
    if (!url && !token.startsWith("--")) {
      url = token;
      continue;
    }

    if (token === "--note") {
      note = args.shift() || "";
      continue;
    }

    if (token === "--intent") {
      intent = args.shift() || "";
      continue;
    }

    if (token === "--excerpt") {
      excerpt = args.shift() || "";
      continue;
    }

    if (token === "--slack-channel") {
      slackChannel = args.shift() || "";
      continue;
    }

    if (token === "--slack-thread-ts") {
      slackThreadTs = args.shift() || "";
      continue;
    }

    throw new Error(`unknown argument: ${token}`);
  }

  if (!url) {
    throw new Error("usage: ./library.sh add <url> [--note <text>] [--intent <value>] [--excerpt <text>]");
  }

  if (intent && !VALID_INTENTS.has(intent)) {
    throw new Error("intent must be one of: interesting, try-soon, keep-for-later");
  }

  return { url, note, intent, excerpt, slackChannel, slackThreadTs };
}

function now() {
  return new Date().toISOString();
}

function updateExistingItem(items, url, patch) {
  const item = items.find((entry) => entry.url === url && entry.status === "pending");
  if (!item) return null;

  for (const [key, value] of Object.entries(patch)) {
    if (key === "slack" && value && typeof value === "object") {
      item.slack = {
        ...(item.slack || {}),
        ...value,
      };
      continue;
    }
    if (value !== "") {
      item[key] = value;
    }
  }

  if (item.source_type === "x" && patch.excerpt) {
    item.fetch_status = "manual";
    delete item.fetch_error;
  }

  item.stage = item.stage || "queued";
  item.error = null;

  return item;
}

function extractXMeta(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) {
    return null;
  }

  const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) {
    return null;
  }

  return { sourceType: "x", authorHint: match[1], postId: match[2] };
}

async function fetchXPost(postId) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return { fetch_status: "skipped", fetch_error: "X_BEARER_TOKEN is not set" };
  }

  const endpoint = new URL(`https://api.x.com/2/tweets/${postId}`);
  endpoint.searchParams.set("expansions", "author_id");
  endpoint.searchParams.set("tweet.fields", "author_id,created_at,text");
  endpoint.searchParams.set("user.fields", "username,name");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.detail || payload?.title || `HTTP ${response.status}`;
    return { fetch_status: "failed", fetch_error: message };
  }

  const author = payload?.includes?.users?.[0] || {};
  return {
    fetch_status: "done",
    fetched_at: now(),
    author: author.username || "",
    author_name: author.name || "",
    text: payload?.data?.text || "",
    posted_at: payload?.data?.created_at || "",
  };
}

async function main() {
  const { url, note, intent, excerpt, slackChannel, slackThreadTs } = parseArgs(process.argv.slice(2));
  const queue = loadPendingQueue();
  const items = Array.isArray(queue.urls) ? queue.urls : [];

  const duplicate = items.find((item) => item.url === url && item.status === "pending");
  if (duplicate) {
    const updated = updateExistingItem(items, url, {
      note,
      intent,
      excerpt,
      slack: slackChannel ? { channel: slackChannel, thread_ts: slackThreadTs || "" } : null,
    });
    savePendingQueue(queue);

    const lines = [`⚠ すでにカウンターにある: ${url}`];
    if (updated?.excerpt) lines.push("  抜粋: 更新");
    if (updated?.note) lines.push(`  ひとこと: ${updated.note}`);
    if (updated?.intent) lines.push(`  意図: ${updated.intent}`);
    if (updated?.fetch_status) lines.push(`  状態: ${updated.fetch_status}`);
    console.log(lines.join("\n"));
    return;
  }

  const item = {
    url,
    note,
    intent,
    excerpt,
    status: "pending",
    stage: "queued",
    added_at: now(),
    fetched_text: "",
    normalized_text: "",
    draft: {
      title: "",
      summary: "",
      tags: [],
      comment: "",
    },
    error: null,
  };

  if (slackChannel) {
    item.slack = {
      channel: slackChannel,
      thread_ts: slackThreadTs || "",
      notified_at: "",
    };
  }

  const xMeta = extractXMeta(url);
  if (xMeta) {
    item.source_type = xMeta.sourceType;
    item.post_id = xMeta.postId;
    item.author_hint = xMeta.authorHint;

    if (excerpt) {
      item.fetch_status = "manual";
    } else {
      const fetched = await fetchXPost(xMeta.postId);
      Object.assign(item, fetched);
    }
  } else {
    item.source_type = "link";
    item.fetch_status = "not-needed";
  }

  items.push(item);
  queue.urls = items;
  savePendingQueue(queue);

  const lines = [
    `✓ 図書室カウンターに追加: ${url}`,
    item.source_type === "x"
      ? `  X入力: ${item.fetch_status}${item.author ? ` / @${item.author}` : ""}`
      : `  種別: ${item.source_type}`,
  ];

  if (item.fetch_error) {
    lines.push(`  理由: ${item.fetch_error}`);
  }
  if (excerpt) {
    lines.push("  抜粋: あり");
  }
  if (intent) {
    lines.push(`  意図: ${intent}`);
  }
  if (note) {
    lines.push(`  ひとこと: ${note}`);
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
