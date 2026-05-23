#!/usr/bin/env tsx

import "dotenv/config";
import { loadPendingQueue, savePendingQueue } from "./library-queue-store.mjs";

type Intent = "interesting" | "try-soon" | "keep-for-later";
type SourceType = "link" | "x";
type FetchStatus = "not-needed" | "manual" | "skipped" | "failed" | "done";

type SlackRef = {
  channel: string;
  thread_ts: string;
  notified_at?: string;
};

type Draft = {
  title: string;
  summary: string;
  tags: string[];
  comment?: string;
};

type QueueItem = {
  url: string;
  note: string;
  intent: Intent | "";
  excerpt: string;
  status: "pending" | "done" | "failed";
  stage: string;
  added_at?: string;
  fetched_text: string;
  normalized_text: string;
  draft: Draft;
  error: unknown | null;
  slack?: SlackRef;
  source_type?: SourceType;
  post_id?: string;
  author_hint?: string;
  fetch_status?: FetchStatus;
  fetch_error?: string;
  fetched_at?: string;
  author?: string;
  author_name?: string;
  text?: string;
  posted_at?: string;
};

type QueueData = {
  urls?: QueueItem[];
};

type ParsedArgs = {
  url: string;
  note: string;
  intent: Intent | "";
  excerpt: string;
  slackChannel: string;
  slackThreadTs: string;
};

type XMeta = {
  sourceType: "x";
  authorHint: string;
  postId: string;
};

type XFetchResult = Partial<QueueItem> & {
  fetch_status: Exclude<FetchStatus, "not-needed" | "manual">;
};

const VALID_INTENTS = new Set<Intent>(["interesting", "try-soon", "keep-for-later"]);

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let url = "";
  let note = "";
  let intent: Intent | "" = "";
  let excerpt = "";
  let slackChannel = "";
  let slackThreadTs = "";

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    if (!url && !token.startsWith("--")) {
      url = token;
      continue;
    }

    if (token === "--note") {
      note = args.shift() || "";
      continue;
    }

    if (token === "--intent") {
      const value = args.shift() || "";
      if (value && !isIntent(value)) {
        throw new Error("intent must be one of: interesting, try-soon, keep-for-later");
      }
      intent = value ? value as Intent : "";
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

  return { url, note, intent, excerpt, slackChannel, slackThreadTs };
}

function isIntent(value: string): value is Intent {
  return VALID_INTENTS.has(value as Intent);
}

function now(): string {
  return new Date().toISOString();
}

function updateExistingItem(
  items: QueueItem[],
  url: string,
  patch: Partial<Pick<QueueItem, "note" | "intent" | "excerpt" | "slack">>,
): QueueItem | null {
  const item = items.find((entry) => entry.url === url && entry.status === "pending");
  if (!item) return null;

  if (patch.slack) {
    item.slack = {
      ...(item.slack || {}),
      ...patch.slack,
    };
  }
  if (patch.note !== undefined && patch.note !== "") item.note = patch.note;
  if (patch.intent !== undefined && patch.intent !== "") item.intent = patch.intent;
  if (patch.excerpt !== undefined && patch.excerpt !== "") item.excerpt = patch.excerpt;

  if (item.source_type === "x" && patch.excerpt) {
    item.fetch_status = "manual";
    delete item.fetch_error;
  }

  item.stage = item.stage || "queued";
  item.error = null;

  return item;
}

function extractXMeta(rawUrl: string): XMeta | null {
  let parsed: URL;
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

async function fetchXPost(postId: string): Promise<XFetchResult> {
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

  const payload = await response.json().catch(() => ({})) as {
    detail?: string;
    title?: string;
    data?: { text?: string; created_at?: string };
    includes?: { users?: Array<{ username?: string; name?: string }> };
  };

  if (!response.ok) {
    const message = payload.detail || payload.title || `HTTP ${response.status}`;
    return { fetch_status: "failed", fetch_error: message };
  }

  const author = payload.includes?.users?.[0] || {};
  return {
    fetch_status: "done",
    fetched_at: now(),
    author: author.username || "",
    author_name: author.name || "",
    text: payload.data?.text || "",
    posted_at: payload.data?.created_at || "",
  };
}

async function main(): Promise<void> {
  const { url, note, intent, excerpt, slackChannel, slackThreadTs } = parseArgs(process.argv.slice(2));
  const queue = loadPendingQueue() as QueueData;
  const items = Array.isArray(queue.urls) ? queue.urls : [];

  const duplicate = items.find((item) => item.url === url && item.status === "pending");
  if (duplicate) {
    const updated = updateExistingItem(items, url, {
      note,
      intent,
      excerpt,
      slack: slackChannel ? { channel: slackChannel, thread_ts: slackThreadTs || "" } : undefined,
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

  const item: QueueItem = {
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
      Object.assign(item, await fetchXPost(xMeta.postId));
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${message}`);
  process.exit(1);
});
