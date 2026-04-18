#!/usr/bin/env node
/**
 * 薄氷図書館MCPサーバー（グローバル用・軽量版）
 * /toshoshitsu スキルと toshoshitsu.sh から使う。
 * 図書館キュー + Obsidianナレッジ操作のみ提供。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";

const BASEDIR = path.join(process.env.HOME, "usurahi");
const QUEUE = path.join(BASEDIR, "queue");
const OBSIDIAN_VAULT = path.join(process.env.HOME, "Documents", "Obsidian Vault");
const OBSIDIAN_USURAHI = path.join(OBSIDIAN_VAULT, "薄氷");
const OBSIDIAN_FOLDERS = { backnumber: "図書館/薄氷バックナンバー", nisshi: "部室/活動記録", library: "図書館/開架" };

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

// ── server ──

const server = new McpServer({
  name: "usurahi-toshoshitsu",
  version: "1.0.0",
});

// ── 1. add_to_toshoshitsu_queue ──

server.tool(
  "add_to_toshoshitsu_queue",
  "薄氷図書館のURLキューにURLを追加する。",
  {
    url: z.string().describe("追加するURL"),
    note: z.string().default("").describe("ひとことメモ（任意）"),
  },
  async ({ url, note }) => {
    const filePath = path.join(QUEUE, "toshoshitsu_queue.yaml");
    const data = readYaml(filePath) || { urls: [] };
    if (!data.urls) data.urls = [];

    if (data.urls.some((item) => item.url === url && item.status !== "done")) {
      return { content: [{ type: "text", text: `既にキューにある: ${url}` }] };
    }

    data.urls.push({ url, note, status: "pending", added_at: timestamp() });
    writeYaml(filePath, data);
    const pending = data.urls.filter((u) => u.status === "pending").length;
    return { content: [{ type: "text", text: `キューに追加: ${url}（未処理: ${pending}件）` }] };
  }
);

// ── 2. get_toshoshitsu_queue ──

server.tool(
  "get_toshoshitsu_queue",
  "薄氷図書館のURLキューを取得する。",
  {
    status: z.enum(["pending", "done", "all"]).default("pending").describe("フィルタするステータス"),
  },
  async ({ status }) => {
    const data = readYaml(path.join(QUEUE, "toshoshitsu_queue.yaml"));
    if (!data?.urls || data.urls.length === 0) return { content: [{ type: "text", text: "キューは空" }] };
    const urls = status === "all" ? data.urls : data.urls.filter((u) => u.status === status);
    if (urls.length === 0) return { content: [{ type: "text", text: `${status}のURLなし` }] };
    return { content: [{ type: "text", text: yaml.dump(urls, { lineWidth: -1 }) }] };
  }
);

// ── 3. update_toshoshitsu_queue ──

server.tool(
  "update_toshoshitsu_queue",
  "薄氷図書館のURLキューのアイテムのstatusを更新する。",
  {
    url: z.string().describe("対象のURL"),
    status: z.enum(["done", "failed"]).describe("新しいステータス"),
  },
  async ({ url, status }) => {
    const filePath = path.join(QUEUE, "toshoshitsu_queue.yaml");
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
    category: z.enum(["backnumber", "nisshi", "library"]).describe("保存先カテゴリ"),
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
    category: z.enum(["backnumber", "nisshi", "library", "all"]).default("all").describe("検索対象カテゴリ"),
  },
  async ({ query, category }) => {
    const searchDirs = [];
    if (category === "all" || category === "backnumber") searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.backnumber));
    if (category === "all" || category === "nisshi") searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.nisshi));
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
    category: z.enum(["backnumber", "nisshi", "library"]).default("backnumber").describe("カテゴリ"),
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
