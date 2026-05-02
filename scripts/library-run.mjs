#!/usr/bin/env node

import "dotenv/config";
import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { loadPendingQueue, savePendingQueue, recordLibraryHistory } from "./library-queue-store.mjs";

const execFileAsync = promisify(execFile);

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLAUDE_BIN = path.join(BASEDIR, "scripts", "claude-app.sh");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;
const LIBRARY_DIR = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "開架");
const MAX_EXCERPT_CHARS = 2400;
const CURL_TIMEOUT_SEC = 20;
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";
const RELATED_TOPIC_VOCAB = [
  "長期運用",
  "セッション管理",
  "コンテキスト管理",
  "分割実行",
  "エージェント協調",
  "品質維持",
  "役割分担",
  "フロー設計",
  "スキル設計",
  "依存整理",
  "判断基準",
  "知識整理",
];
const NEXT_READ_VOCAB = [
  "失敗復帰",
  "継続判断",
  "分割実行",
  "エージェント協調",
  "コンテキスト管理",
  "フロー設計",
  "スキル設計",
  "依存整理",
  "判断基準",
  "知識整理",
];
const TAG_NORMALIZATION = new Map([
  ["security", "セキュリティ"],
  ["session management", "セッション管理"],
  ["version management", "バージョン管理"],
  ["skills", "スキル"],
  ["skill", "スキル"],
  ["agent skills", "スキル管理"],
  ["agent", "エージェント"],
  ["context management", "コンテキスト管理"],
  ["context optimization", "コンテキスト最適化"],
  ["context rot", "context rot"],
  ["rewind", "rewind"],
  ["cli", "CLI"],
  ["github cli", "GitHub CLI"],
  ["claude code", "Claude Code"],
]);

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function ensurePipelineFields(item) {
  if (!item.stage) item.stage = "queued";
  if (!("fetched_text" in item)) item.fetched_text = item.text || "";
  if (!("normalized_text" in item)) item.normalized_text = "";
  if (!item.draft || typeof item.draft !== "object") {
    item.draft = {
      title: "",
      summary: "",
      tags: [],
      use_case: "",
      save_value: "",
      related_topics: [],
      next_read: [],
    };
  } else if (!("use_case" in item.draft)) {
    item.draft.use_case = item.draft.comment || "";
  }
  if (!("save_value" in item.draft)) item.draft.save_value = "";
  if (!Array.isArray(item.draft.related_topics)) item.draft.related_topics = [];
  if (!Array.isArray(item.draft.next_read)) item.draft.next_read = [];
  if (!("error" in item)) item.error = null;
  if (item.slack && typeof item.slack === "object") {
    if (!("channel" in item.slack)) item.slack.channel = "";
    if (!("thread_ts" in item.slack)) item.slack.thread_ts = "";
    if (!("notified_at" in item.slack)) item.slack.notified_at = "";
  }
}

function formatSlackPath(savedPath) {
  if (!savedPath) return "";
  return String(savedPath).replace(/^図書館\//, "");
}

function inferShelfLabel(item) {
  const savedPath = formatSlackPath(item.saved_path || item.duplicate_of || "");
  if (!savedPath) return "";
  const segments = savedPath.split("/").filter(Boolean);
  if (segments.length < 3) return savedPath;
  return `${segments[1]} / ${segments[2].replace(/\.md$/, "")}`;
}

function summarizeTags(tags) {
  const items = Array.isArray(tags) ? tags.slice(0, 4) : [];
  if (items.length === 0) return "";
  return items.map((tag) => `#${tag}`).join(" ");
}

async function postSlackUpdate(item, text) {
  if (!item.slack?.channel || !process.env.SLACK_BOT_TOKEN) {
    return false;
  }

  const payload = {
    channel: item.slack.channel,
    text,
    unfurl_links: false,
    unfurl_media: false,
  };

  if (item.slack.thread_ts) {
    payload.thread_ts = item.slack.thread_ts;
  }

  const response = await fetch(SLACK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  item.slack.notified_at = now();
  item.slack.last_message_ts = result.ts || "";
  return true;
}

async function notifySlackResult(item) {
  if (!item.slack?.channel) {
    return;
  }

  let text = "";
  if (item.status === "done" && item.duplicate_of) {
    const shelf = inferShelfLabel(item);
    text = [
      "前に入っていた本だったわ。",
      item.title ? `本の名前\n${item.title}` : "",
      shelf ? `棚\n${shelf}` : "",
      item.saved_path ? `場所\n${formatSlackPath(item.saved_path)}` : "",
      "同じ本は増やしていないわ。既存の棚を使って。",
    ].filter(Boolean).join("\n\n");
  } else if (item.status === "done") {
    const shelf = inferShelfLabel(item);
    text = [
      item.title ? "片づいたわ。ちゃんと棚に入れておいた。" : "片づいたわ。棚に入れておいたわね。",
      item.title ? `本の名前\n${item.title}` : "",
      shelf ? `棚\n${shelf}` : "",
      item.saved_path ? `場所\n${formatSlackPath(item.saved_path)}` : "",
      item.tags?.length ? `タグ\n${summarizeTags(item.tags)}` : "",
      item.summary ? `ざっと言うと\n${item.summary}` : "",
      item.use_case ? `薄氷で使うなら\n${item.use_case}` : "",
    ].filter(Boolean).join("\n\n");
  } else if (item.status === "failed") {
    const nextAction = suggestAction(item) === "refetch"
      ? "本文取得で詰まった。必要なら URL をもう一度投げるか、抜粋付きで入れて。"
      : "整理段階で詰まった。必要なら同じ URL をもう一度投げて。";
    text = [
      "手を付けたんだけど、ここで詰まったわ。",
      item.stage ? `段階\n${item.stage}` : "",
      item.error?.message ? `理由\n${item.error.message}` : "",
      `次\n${nextAction}`,
    ].filter(Boolean).join("\n\n");
  }

  if (!text) return;

  try {
    await postSlackUpdate(item, text);
  } catch (error) {
    console.error(`Slack 通知に失敗: ${item.url} / ${error.message}`);
  }
}

function truncateText(text, limit = MAX_EXCERPT_CHARS) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");
}

function stripHtml(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractArticleText(html) {
  const codeLineMatches = [...String(html || "").matchAll(/class="code-line"[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3|blockquote)>/gi)];
  if (codeLineMatches.length > 0) {
    return codeLineMatches
      .map((match) => stripHtml(match[1]))
      .filter(Boolean)
      .join("\n");
  }

  const articleMatch = String(html || "").match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    return stripHtml(articleMatch[1]);
  }

  return stripHtml(html);
}

function sanitizeFileName(input) {
  return String(input || "untitled")
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}

function normalizeTag(tag) {
  const value = String(tag || "").trim();
  if (!value) return "";

  const normalizedKey = value.toLowerCase();
  if (TAG_NORMALIZATION.has(normalizedKey)) {
    return TAG_NORMALIZATION.get(normalizedKey) || "";
  }

  return value;
}

function normalizeTags(tags) {
  const seen = new Set();
  const result = [];

  for (const tag of tags || []) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result.slice(0, 5);
}

function normalizeFromVocab(values, vocab, maxCount) {
  const allowed = new Map(vocab.map((entry) => [entry.toLowerCase(), entry]));
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const canonical = allowed.get(normalized.toLowerCase());
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }

  return result.slice(0, maxCount);
}

function buildFrontmatter(tags) {
  const allTags = ["薄氷", "library", ...tags];
  const tagLines = allTags.map((tag) => `  - ${tag}`).join("\n");
  return `---\ndate: ${today()}\ncategory: library\ntags:\n${tagLines}\n---\n\n`;
}

function buildContent(item, meta) {
  const sections = [];

  if (item.note) {
    sections.push(`## ひとこと\n> ${item.note}`);
  }

  if (item.intent) {
    sections.push(`## 保存意図\n- ${item.intent}`);
  }

  sections.push(`## 概要\n${meta.summary}`);

  if (item.excerpt) {
    sections.push(`## 抜粋\n> ${truncateText(item.excerpt, 320).replace(/\n/g, "\n> ")}`);
  }

  sections.push(`## 保存価値\n- ${meta.save_value}`);
  sections.push(`## 薄氷での使いどころ\n- ${meta.use_case}`);
  sections.push(`## 関連トピック\n${meta.related_topics.map((topic) => `- ${topic}`).join("\n")}`);
  sections.push(`## 次に見るもの\n${meta.next_read.map((entry) => `- ${entry}`).join("\n")}`);
  sections.push(`## 出典\n- [元リンク](${item.url})`);

  return sections.join("\n\n");
}

function existingLibraryFiles() {
  if (!fs.existsSync(LIBRARY_DIR)) {
    return [];
  }
  return fs.readdirSync(LIBRARY_DIR).filter((file) => file.endsWith(".md") && !file.includes(".bak-"));
}

function findDuplicateByUrl(url) {
  for (const file of existingLibraryFiles()) {
    const filePath = path.join(LIBRARY_DIR, file);
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes(url)) {
      return file;
    }
  }
  return null;
}

function parseJsonBlock(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("JSON が見つからない");
    }
    return JSON.parse(match[0]);
  }
}

async function runClaudePrompt(prompt) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      [
        "--model",
        "claude-haiku-4-5-20251001",
        "--dangerously-skip-permissions",
        "--max-turns",
        "6",
        "-p",
        prompt,
      ],
      {
        cwd: BASEDIR,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:${process.env.PATH || ""}`,
          ANTHROPIC_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude の応答がタイムアウトした"));
    }, 120000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function fetchUrlText(url) {
  const { stdout } = await execFileAsync(
    "curl",
    ["-L", "--max-time", String(CURL_TIMEOUT_SEC), url],
    {
      cwd: BASEDIR,
      timeout: (CURL_TIMEOUT_SEC + 5) * 1000,
      maxBuffer: 1024 * 1024 * 3,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ""}` },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const extracted = extractArticleText(stdout);
  if (!extracted) {
    throw new Error("本文を取得できなかった");
  }
  return truncateText(extracted, MAX_EXCERPT_CHARS);
}

async function askMayaka(item) {
  const excerpt = truncateText(item.normalized_text || item.excerpt || item.fetched_text || item.text || "", MAX_EXCERPT_CHARS);
  const prompt = `
あなたは伊原摩耶花。薄氷図書館の整理役。

次の入力を読んで、タイトル・短い要約・タグ・保存価値・薄氷での使いどころ・関連トピック・次に見るものだけを返して。
保存や状態更新はしない。JSON だけを返すこと。

入力:
- url: ${item.url}
- source_type: ${item.source_type || "link"}
- note: ${item.note || ""}
- intent: ${item.intent || ""}
- excerpt: ${excerpt}

制約:
- summary は 2 文以内
- tags は 3 個から 5 個
- tags は短い日本語を基本にする
- 固有名詞だけ英語でもよい
- 一般語は英語のまま残さず、日本語へ言い換える
- 例: session management -> セッション管理, security -> セキュリティ, skills -> スキル
- save_value は「なぜ残すか」を 1 文で書く
- use_case は「薄氷での使いどころ」として 1 文
- use_case を特に重視する。抽象論ではなく、薄氷の実際の運用や設計にどう落とし込めるかを優先する
- related_topics は 2 個から 4 個
- next_read は 1 個から 3 個
- related_topics と next_read は短い句で書く
- related_topics は次の候補からだけ選ぶ:
  - 長期運用
  - セッション管理
  - コンテキスト管理
  - 分割実行
  - エージェント協調
  - 品質維持
  - 役割分担
  - フロー設計
  - スキル設計
  - 依存整理
  - 判断基準
  - 知識整理
- next_read は次の候補からだけ選ぶ:
  - 失敗復帰
  - 継続判断
  - 分割実行
  - エージェント協調
  - コンテキスト管理
  - フロー設計
  - スキル設計
  - 依存整理
  - 判断基準
  - 知識整理
- 余計な説明は禁止

出力JSON:
{
  "title": "...",
  "summary": "...",
  "tags": ["...", "..."],
  "save_value": "...",
  "use_case": "...",
  "related_topics": ["...", "..."],
  "next_read": ["...", "..."]
}
`.trim();

  const stdout = await runClaudePrompt(prompt);

  const parsed = parseJsonBlock(stdout);
  if (
    !parsed.title ||
    !parsed.summary ||
    !Array.isArray(parsed.tags) ||
    parsed.tags.length === 0 ||
    !parsed.save_value ||
    !parsed.use_case ||
    !Array.isArray(parsed.related_topics) ||
    parsed.related_topics.length === 0 ||
    !Array.isArray(parsed.next_read) ||
    parsed.next_read.length === 0
  ) {
    throw new Error("摩耶花の出力形式が不正");
  }

  const relatedTopics = normalizeFromVocab(parsed.related_topics, RELATED_TOPIC_VOCAB, 4);
  const nextRead = normalizeFromVocab(parsed.next_read, NEXT_READ_VOCAB, 3);
  if (relatedTopics.length === 0 || nextRead.length === 0) {
    throw new Error("摩耶花の棚語彙が不正");
  }

  return {
    title: String(parsed.title).trim(),
    summary: String(parsed.summary).trim(),
    tags: normalizeTags(parsed.tags.map((tag) => String(tag).trim()).filter(Boolean)),
    save_value: String(parsed.save_value).trim(),
    use_case: String(parsed.use_case).trim(),
    related_topics: relatedTopics,
    next_read: nextRead,
  };
}

function markItem(item, status, extra = {}) {
  item.status = status;
  item.processed_at = now();
  Object.assign(item, extra);
}

function setStage(item, stage) {
  item.stage = stage;
}

function setError(item, stage, message) {
  item.error = {
    stage,
    message: String(message || ""),
    at: now(),
  };
}

function suggestAction(item) {
  const stage = item.stage || "";
  const message = String(item.error?.message || "").toLowerCase();

  if (stage === "fetch") return "refetch";
  if (message.includes("取得") || message.includes("could not resolve") || message.includes("timed out") || message.includes("http ")) {
    return "refetch";
  }
  if (stage === "normalize" || stage === "summarize" || stage === "save") {
    return "retry";
  }
  return "retry";
}

async function processItem(item) {
  ensurePipelineFields(item);
  setStage(item, "fetch");

  if (!item.excerpt && !item.text && !item.fetched_text) {
    if (item.source_type === "link") {
      item.fetched_text = await fetchUrlText(item.url);
    } else {
      throw new Error("excerpt か text が必要");
    }
  }

  setStage(item, "normalize");
  item.normalized_text = truncateText(item.excerpt || item.text || item.fetched_text || "", MAX_EXCERPT_CHARS);
  if (!item.normalized_text) {
    throw new Error("要約用の入力を作れなかった");
  }

  const duplicate = findDuplicateByUrl(item.url);
  if (duplicate) {
    markItem(item, "done", {
      stage: "done",
      title: duplicate.replace(/\.md$/, ""),
      saved_path: path.join("図書館", "開架", duplicate),
      duplicate_of: duplicate,
    });
    return `📚 「${duplicate.replace(/\.md$/, "")}」\n   → もう登録済みよ。重複は増やさないで。`;
  }

  setStage(item, "summarize");
  const meta = await askMayaka(item);
  item.draft.title = meta.title;
  item.draft.summary = meta.summary;
  item.draft.tags = meta.tags;
  item.draft.save_value = meta.save_value;
  item.draft.use_case = meta.use_case;
  item.draft.related_topics = meta.related_topics;
  item.draft.next_read = meta.next_read;

  setStage(item, "save");
  const title = sanitizeFileName(meta.title);
  const content = buildFrontmatter(meta.tags) + buildContent(item, meta);

  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  const filePath = path.join(LIBRARY_DIR, `${title}.md`);
  fs.writeFileSync(filePath, content, "utf8");

  markItem(item, "done", {
    stage: "done",
    title,
    saved_path: path.relative(OBSIDIAN_USURAHI_DIR, filePath),
    tags: meta.tags,
    summary: meta.summary,
    save_value: meta.save_value,
    use_case: meta.use_case,
    related_topics: meta.related_topics,
    next_read: meta.next_read,
  });

  return [
    `📚 「${title}」`,
    `   タグ: ${meta.tags.map((tag) => `#${tag}`).join(" ")}`,
    `   概要: ${meta.summary}`,
    `   保存価値: ${meta.save_value}`,
    `   使いどころ: ${meta.use_case}`,
    `   → 開架に入れたわよ。`,
  ].join("\n");
}

async function main() {
  const data = loadPendingQueue();
  const items = Array.isArray(data.urls) ? data.urls : [];
  for (const item of items) {
    ensurePipelineFields(item);
  }
  const pendingItems = items.filter((item) => item.status === "pending");

  if (pendingItems.length === 0) {
    console.log("摩耶花「返す本もないじゃない。帰るわよ」");
    return;
  }

  let doneCount = 0;
  let failedCount = 0;
  const failedItems = [];

  for (const item of pendingItems) {
    try {
      const message = await processItem(item);
      console.log(message);
      await notifySlackResult(item);
      doneCount += 1;
    } catch (error) {
      const failedStage = item.stage || "unknown";
      markItem(item, "failed", {});
      setError(item, failedStage, error.message);
      console.log(`❌ ${item.url}\n   理由: ${error.message}\n   次: URL をもう一度送る`);
      failedItems.push({
        url: item.url,
        stage: failedStage,
        message: error.message,
      });
      await notifySlackResult(item);
      failedCount += 1;
    }
    recordLibraryHistory(item);
    data.urls = items.filter((entry) => entry.status === "pending");
    savePendingQueue(data);
    console.log("");
  }

  console.log(`摩耶花「${doneCount}件整理したわよ。${failedCount > 0 ? `失敗は${failedCount}件。` : "ちゃんとタグ付けしておいたから。"}」`);
  if (failedItems.length > 0) {
    for (const item of failedItems) {
      console.log(`   - ${item.url}`);
      console.log(`     ${item.stage} / ${item.message} / send-url-again`);
    }
  }
}

main().catch((error) => {
  console.error(`❌ 図書室処理に失敗: ${error.message}`);
  process.exit(1);
});
