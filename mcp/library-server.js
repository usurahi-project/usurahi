#!/usr/bin/env node
/**
 * 薄氷図書館MCPサーバー（グローバル用・軽量版）
 * /library スキルと library.sh から使う。
 * 図書館キュー + Obsidianナレッジ操作のみ提供。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUEUE = path.join(BASEDIR, "queue");
const DEFAULT_OBSIDIAN_USURAHI = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI;
const OBSIDIAN_FOLDERS = { archive: "図書館/薄氷バックナンバー", activity_log: "部室/活動記録", library: "図書館/開架" };

// ── helpers ──

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content) || null;
}

function writeYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

function extractXMeta(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match) return null;
    return { sourceType: "x", authorHint: match[1], postId: match[2] };
  } catch {
    return null;
  }
}

async function fetchXPost(postId) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return { ok: false, error: "X_BEARER_TOKEN is not set", fetch_status: "skipped" };
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
    const error = payload?.detail || payload?.title || `HTTP ${response.status}`;
    return { ok: false, error, fetch_status: "failed" };
  }

  const author = payload?.includes?.users?.[0] || {};
  return {
    ok: true,
    data: {
      post_id: payload?.data?.id || postId,
      text: payload?.data?.text || "",
      author: author.username || "",
      author_name: author.name || "",
      posted_at: payload?.data?.created_at || "",
      fetched_at: timestamp(),
    },
  };
}

// ── server ──

const server = new McpServer({
  name: "usurahi-library",
  version: "1.0.0",
});

// ── 1. add_to_library_queue ──

server.tool(
  "add_to_library_queue",
  "薄氷図書館のURLキューにURLを追加する。",
  {
    url: z.string().describe("追加するURL"),
    note: z.string().default("").describe("ひとことメモ（任意）"),
    intent: z.string().default("").describe("保存意図（任意）"),
    excerpt: z.string().default("").describe("抜粋本文。Xはこれを推奨"),
  },
  async ({ url, note, intent, excerpt }) => {
    const filePath = path.join(QUEUE, "library_queue.yaml");
    const data = readYaml(filePath) || { urls: [] };
    if (!data.urls) data.urls = [];

    if (data.urls.some((item) => item.url === url && item.status !== "done")) {
      return { content: [{ type: "text", text: `既にキューにある: ${url}` }] };
    }

    const item = { url, note, intent, excerpt, status: "pending", added_at: timestamp() };
    const xMeta = extractXMeta(url);
    if (xMeta) {
      item.source_type = xMeta.sourceType;
      item.post_id = xMeta.postId;
      item.author_hint = xMeta.authorHint;
      if (excerpt) {
        item.fetch_status = "manual";
      } else {
        const fetched = await fetchXPost(xMeta.postId);
        item.fetch_status = fetched.ok ? "done" : (fetched.fetch_status || "failed");
        if (fetched.ok) {
          Object.assign(item, fetched.data);
        } else {
          item.fetch_error = fetched.error;
        }
      }
    } else {
      item.source_type = "link";
      item.fetch_status = "not-needed";
    }

    data.urls.push(item);
    writeYaml(filePath, data);
    const pending = data.urls.filter((u) => u.status === "pending").length;
    return { content: [{ type: "text", text: `キューに追加: ${url}（未処理: ${pending}件）` }] };
  }
);

// ── 2. get_library_queue ──

server.tool(
  "get_library_queue",
  "薄氷図書館のURLキューを取得する。",
  {
    status: z.enum(["pending", "done", "all"]).default("pending").describe("フィルタするステータス"),
  },
  async ({ status }) => {
    const data = readYaml(path.join(QUEUE, "library_queue.yaml"));
    if (!data?.urls || data.urls.length === 0) return { content: [{ type: "text", text: "キューは空" }] };
    const urls = status === "all" ? data.urls : data.urls.filter((u) => u.status === status);
    if (urls.length === 0) return { content: [{ type: "text", text: `${status}のURLなし` }] };
    return { content: [{ type: "text", text: yaml.dump(urls, { lineWidth: -1 }) }] };
  }
);

// ── 3.5 fetch_x_post ──

server.tool(
  "fetch_x_post",
  "Xの投稿URLまたは投稿IDから本文を取得する。",
  {
    url: z.string().optional().describe("X投稿URL"),
    post_id: z.string().optional().describe("X投稿ID"),
  },
  async ({ url, post_id }) => {
    const derived = post_id ? { postId: post_id } : extractXMeta(url || "");
    if (!derived?.postId) {
      return { content: [{ type: "text", text: "有効なX投稿URLまたはpost_idが必要です" }] };
    }

    const fetched = await fetchXPost(derived.postId);
    if (!fetched.ok) {
      return { content: [{ type: "text", text: `取得失敗: ${fetched.error}` }] };
    }

    return { content: [{ type: "text", text: yaml.dump(fetched.data, { lineWidth: -1 }) }] };
  }
);

// ── 3. update_library_queue ──

server.tool(
  "update_library_queue",
  "薄氷図書館のURLキューのアイテムのstatusを更新する。",
  {
    url: z.string().describe("対象のURL"),
    status: z.enum(["done", "failed"]).describe("新しいステータス"),
  },
  async ({ url, status }) => {
    const filePath = path.join(QUEUE, "library_queue.yaml");
    const data = readYaml(filePath) || { urls: [] };
    const item = data.urls?.find((u) => u.url === url);
    if (!item) return { content: [{ type: "text", text: `キューに見つからない: ${url}` }] };
    item.status = status;
    item.processed_at = timestamp();
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${url} を ${status} に更新` }] };
  }
);

// ── 4. save_to_obsidian ──

server.tool(
  "save_to_obsidian",
  "Obsidian Vaultにナレッジノートを保存する。フロントマター(tags, date等)とwiki-linkを自動付与。",
  {
    category: z.enum(["archive", "activity_log", "library"]).describe("保存先カテゴリ"),
    title: z.string().describe("ノートのタイトル（ファイル名になる）"),
    content: z.string().describe("ノートの本文（Markdown）"),
    tags: z.array(z.string()).default([]).describe("タグ一覧"),
    related: z.array(z.string()).default([]).describe("関連ノートのタイトル（wiki-linkになる）"),
  },
  async ({ category, title, content, tags, related }) => {
    const folderName = OBSIDIAN_FOLDERS[category] || category;
    const dir = path.join(OBSIDIAN_USURAHI, folderName);
    fs.mkdirSync(dir, { recursive: true });

    const today = new Date().toISOString().split("T")[0];
    const allTags = ["薄氷", category, ...tags];
    const tagLine = allTags.map((t) => `  - ${t}`).join("\n");
    let frontmatter = `---\ndate: ${today}\ncategory: ${category}\ntags:\n${tagLine}\n---\n\n`;

    if (related.length > 0) {
      const links = related.map((r) => `- [[${r}]]`).join("\n");
      content += `\n\n## 関連\n${links}\n`;
    }

    const filePath = path.join(dir, `${title}.md`);
    fs.writeFileSync(filePath, frontmatter + content, "utf8");
    return { content: [{ type: "text", text: `Obsidian保存完了: 薄氷/${folderName}/${title}.md` }] };
  }
);

// ── 5. search_obsidian ──

server.tool(
  "search_obsidian",
  "Obsidian Vault内の薄氷ナレッジを検索する。キーワードでファイル名と内容を横断検索。",
  {
    query: z.string().describe("検索キーワード"),
    category: z.enum(["archive", "activity_log", "library", "all"]).default("all").describe("検索対象カテゴリ"),
  },
  async ({ query, category }) => {
    const searchDirs = [];
    if (category === "all" || category === "archive") searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.archive));
    if (category === "all" || category === "activity_log") searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.activity_log));
    if (category === "all" || category === "library") searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.library));

    const results = [];
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const lowerQuery = query.toLowerCase();
        if (file.toLowerCase().includes(lowerQuery) || content.toLowerCase().includes(lowerQuery)) {
          const lines = content.split("\n");
          const matchLines = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              matchLines.push(`L${i + 1}: ${lines[i].substring(0, 100)}`);
              if (matchLines.length >= 3) break;
            }
          }
          results.push({
            file: path.relative(OBSIDIAN_USURAHI, filePath),
            title: file.replace(".md", ""),
            matches: matchLines.length > 0 ? matchLines : ["(ファイル名マッチ)"],
          });
        }
      }
    }

    if (results.length === 0) return { content: [{ type: "text", text: `「${query}」に一致するノートなし` }] };
    const output = results.map((r) => `## [[${r.title}]]\nパス: ${r.file}\n${r.matches.join("\n")}`).join("\n\n");
    return { content: [{ type: "text", text: `${results.length}件ヒット:\n\n${output}` }] };
  }
);

// ── 6. read_obsidian_note ──

server.tool(
  "read_obsidian_note",
  "Obsidian Vault内の薄氷ノートを読む。",
  {
    title: z.string().describe("ノートのタイトル（拡張子なし）"),
    category: z.enum(["archive", "activity_log", "library"]).default("archive").describe("カテゴリ"),
  },
  async ({ title, category }) => {
    const folderName = OBSIDIAN_FOLDERS[category] || category;
    const filePath = path.join(OBSIDIAN_USURAHI, folderName, `${title}.md`);
    if (!fs.existsSync(filePath)) return { content: [{ type: "text", text: `ノートが見つからない: ${title}` }] };
    const content = fs.readFileSync(filePath, "utf8");
    return { content: [{ type: "text", text: content }] };
  }
);

// ── start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("図書館MCPサーバー起動エラー:", err);
  process.exit(1);
});
