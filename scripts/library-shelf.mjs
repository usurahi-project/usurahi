#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;
const LIBRARY_DIR = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "開架");
const LIBRARY_ROOT_DIR = path.join(OBSIDIAN_USURAHI_DIR, "図書館");
const DEFAULT_SHELF_DIR = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "書架");
const FALLBACK_SHELF_DIR = path.join(BASEDIR, "library-shelves");
const DASHBOARD_FILE = path.join(LIBRARY_ROOT_DIR, "図書館ダッシュボード.md");

const SHELF_RULES = [
  { name: "AIエージェント", keywords: ["Claude Code", "Codex", "agent", "エージェント", "subagent", "MCP"] },
  { name: "薄氷設計", keywords: ["薄氷", "長期運用", "知識整理", "フロー設計", "コンテキスト管理", "役割分担", "判断基準"] },
  { name: "セッション管理", keywords: ["セッション管理", "context window", "コンテキスト", "memory", "CLAUDE.md", "/compact", "/clear", "/rewind"] },
  { name: "自動化", keywords: ["自動化", "automation", "hook", "hooks", "cron", "定期実行", "pipeline", "GitHub Action", "nightly", "自動修復"] },
  { name: "スキル設計", keywords: ["スキル", "skills", "skill", "SKILL.md", "gh skill", "humanizer"] },
  { name: "MCP・拡張", keywords: ["MCP", "plugin", "plugins", "プラグイン", "custom tool", "カスタムツール", "SDK", "拡張"] },
  { name: "評価と品質", keywords: ["評価", "quality", "品質", "テスト", "review", "レビュー", "診断", "doctor", "メトリクス", "計測"] },
];

function readFrontmatter(content) {
  const match = String(content).match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  return yaml.load(match[1]) || {};
}

function stripFrontmatter(content) {
  return String(content).replace(/^---\n[\s\S]*?\n---\n/, "");
}

function extractSection(content, heading) {
  const match = String(content).match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(\\n## |$)`));
  return match ? match[1].trim() : "";
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstMeaningfulLine(content) {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && line !== "---" && !line.startsWith("- ") && !line.startsWith(">") && !line.startsWith("```")) || "";
}

function cleanSummaryLine(line) {
  return String(line || "").replace(/^#+\s*/, "").trim();
}

function normalizeTag(tag) {
  return String(tag || "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function topLevelShelf(file) {
  const first = String(file || "").split("/")[0] || "";
  return first && first !== "index.md" ? first : "";
}

function thematicShelves(note) {
  const result = [];
  const haystack = [
    note.title,
    note.folder,
    note.topic,
    note.summary,
    note.source,
    ...note.tags,
  ]
    .map((value) => normalizeTag(value).toLowerCase())
    .filter(Boolean);

  for (const shelf of SHELF_RULES) {
    if (shelf.keywords.some((keyword) => haystack.some((tag) => tag.includes(String(keyword).toLowerCase())))) {
      result.push(shelf.name);
    }
  }
  return result;
}

function shelvesFor(note) {
  const result = [];
  const topLevel = topLevelShelf(note.file);
  if (topLevel) result.push(topLevel);
  result.push(...thematicShelves(note));
  return unique(result.length ? result : ["未分類"]);
}

function walkMarkdownFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, result);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(full);
    }
  }
  return result;
}

function loadNotes() {
  return walkMarkdownFiles(LIBRARY_DIR)
    .map((filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      const body = stripFrontmatter(content);
      const frontmatter = readFrontmatter(content);
      const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
      const relativePath = path.relative(LIBRARY_DIR, filePath);
      const summary = cleanSummaryLine(
        firstMeaningfulLine(extractSection(content, "概要"))
        || firstMeaningfulLine(extractSection(content, "要点"))
        || firstMeaningfulLine(body),
      );

      const note = {
        title: path.basename(filePath, ".md"),
        file: relativePath.replace(/\\/g, "/"),
        folder: path.dirname(relativePath).replace(/\\/g, "/") === "." ? "開架" : path.dirname(relativePath).replace(/\\/g, "/"),
        tags,
        topic: frontmatter.topic || "",
        summary,
        source: frontmatter.source || extractSection(content, "出典").split("\n")[0] || "",
      };
      note.shelves = shelvesFor(note);
      return note;
    })
    .filter((note) => note.title !== "index");
}

function classifyShelves(notes, shelfMap) {
  const baseShelves = unique(notes.map((note) => topLevelShelf(note.file))).filter((name) => shelfMap.has(name));
  const overlayShelves = [...shelfMap.keys()].filter((name) => !baseShelves.includes(name) && name !== "未分類");
  const miscShelves = shelfMap.has("未分類") ? ["未分類"] : [];
  return { baseShelves, overlayShelves, miscShelves };
}

function writeFrontmatterFile(filePath, title, bodyLines) {
  const content = [
    "---",
    "type: guide",
    "status: stable",
    "topic: 図書館運用",
    `created: ${today()}`,
    `updated: ${today()}`,
    "---",
    "",
    `# ${title}`,
    "",
    ...bodyLines,
    "",
  ].join("\n");
  fs.writeFileSync(filePath, content, "utf8");
}

function buildIndexContent(shelfMap, shelfGroups, options = {}) {
  const lines = [
    "テーマ別に本を探すための入口。`開架` の中身を横断して、複数の観点で本を束ねる。",
    "",
    `更新日: ${today()}`,
    "",
    "## 基本棚",
    "",
  ];

  for (const shelf of [...shelfGroups.baseShelves].sort((a, b) => a.localeCompare(b, "ja"))) {
    lines.push(`- [[${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
  }

  if (shelfGroups.overlayShelves.length > 0) {
    lines.push("", "## 横断棚", "");
    for (const shelf of [...shelfGroups.overlayShelves].sort((a, b) => a.localeCompare(b, "ja"))) {
      lines.push(`- [[${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
    }
  }

  if (shelfGroups.miscShelves.length > 0) {
    lines.push("", "## 要整理", "");
    for (const shelf of shelfGroups.miscShelves) {
      lines.push(`- [[${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
    }
  }

  if (options.includeVaultEntrances) {
    lines.push("", "## 既存の入口", "", "- [[../図書館ダッシュボード|図書館ダッシュボード]]");
  }

  return lines;
}

function buildShelfContent(shelf, notes, options = {}) {
  const lines = [`${shelf} に関係する本を、棚をまたいで集めた書架。`, ""];
  for (const note of notes.sort((a, b) => a.title.localeCompare(b.title, "ja"))) {
    const link = options.vaultLinks ? `[[../開架/${note.file}|${note.title}]]` : `[[${note.title}]]`;
    lines.push(`- ${link}`);
    if (note.summary) lines.push(`  - ${note.summary}`);
    lines.push(`  - 棚: ${note.folder} / 話題: ${note.topic || note.folder}`);
    if (note.source) lines.push(`  - 出典: ${note.source}`);
  }
  return lines;
}

function buildDashboardContent(shelfMap, shelfGroups) {
  const lines = [
    "図書館の入口。`開架` `閉架` `バックナンバー` `書架` をここから見る。",
    "",
    "## 入口",
    "",
    "- [[開架]]",
    "- [[閉架]]",
    "- [[薄氷バックナンバー]]",
    "- [[書架/index|書架 index]]",
    "",
    "## 読み方",
    "",
    "- `開架`: 正本の知識ノート",
    "- `閉架`: 途中版や退避版",
    "- `薄氷バックナンバー`: 再利用知見のアーカイブ",
    "- `書架`: テーマ横断で探すための入口",
    "",
    "## まず見る場所",
    "",
    "![[書架/index]]",
    "",
    "## 基本棚",
    "",
  ];

  for (const shelf of [...shelfGroups.baseShelves].sort((a, b) => a.localeCompare(b, "ja"))) {
    lines.push(`- [[書架/${shelf}|${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
  }

  if (shelfGroups.overlayShelves.length > 0) {
    lines.push("", "## 横断棚", "");
    for (const shelf of [...shelfGroups.overlayShelves].sort((a, b) => a.localeCompare(b, "ja"))) {
      lines.push(`- [[書架/${shelf}|${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
    }
  }

  if (shelfGroups.miscShelves.length > 0) {
    lines.push("", "## 要整理", "");
    for (const shelf of shelfGroups.miscShelves) {
      lines.push(`- [[書架/${shelf}|${shelf}]] (${shelfMap.get(shelf)?.length || 0})`);
    }
  }

  return lines;
}

function main() {
  const notes = loadNotes();
  const shelfMap = new Map();
  for (const note of notes) {
    for (const shelf of note.shelves) {
      const items = shelfMap.get(shelf) || [];
      items.push(note);
      shelfMap.set(shelf, items);
    }
  }
  const shelfGroups = classifyShelves(notes, shelfMap);

  const outputDirs = [DEFAULT_SHELF_DIR, FALLBACK_SHELF_DIR];
  for (const shelfDir of outputDirs) {
    fs.mkdirSync(shelfDir, { recursive: true });
    const isVaultDir = shelfDir === DEFAULT_SHELF_DIR;
    writeFrontmatterFile(
      path.join(shelfDir, "index.md"),
      "図書館 書架 index",
      buildIndexContent(shelfMap, shelfGroups, { includeVaultEntrances: isVaultDir }),
    );
    for (const [shelf, items] of shelfMap.entries()) {
      writeFrontmatterFile(
        path.join(shelfDir, `${shelf}.md`),
        shelf,
        buildShelfContent(shelf, items, { vaultLinks: isVaultDir }),
      );
    }
  }

  fs.mkdirSync(LIBRARY_ROOT_DIR, { recursive: true });
  writeFrontmatterFile(DASHBOARD_FILE, "図書館ダッシュボード", buildDashboardContent(shelfMap, shelfGroups));

  console.log(`library-shelf: ${notes.length} note(s), ${shelfMap.size} shelf(s), dir=${DEFAULT_SHELF_DIR}`);
}

main();
