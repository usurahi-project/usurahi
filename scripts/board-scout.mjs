#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BOARD_FILE = path.join(BASEDIR, "queue", "noticeboard.yaml");
const NEWS_STATE_FILE = path.join(BASEDIR, "queue", "news_watch_state.yaml");
const LIBRARY_QUEUE_FILE = path.join(BASEDIR, "queue", "library_queue.yaml");
const RULES_DIR = path.join(BASEDIR, "school-rules");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;
const SHELF_INDEX_FILE = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "書架", "index.md");
const FALLBACK_SHELF_INDEX_FILE = path.join(BASEDIR, "library-shelves", "index.md");

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

function loadYaml(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, "utf8")) || fallback;
}

function saveYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

function ageHours(isoString) {
  if (!isoString) return Number.POSITIVE_INFINITY;
  const time = Date.parse(isoString);
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / (1000 * 60 * 60);
}

function countPendingLibrary() {
  const data = loadYaml(LIBRARY_QUEUE_FILE, { urls: [] });
  const items = Array.isArray(data.urls) ? data.urls : [];
  return items.filter((item) => item.status === "pending").length;
}

function ruleFiles() {
  if (!fs.existsSync(RULES_DIR)) return [];
  return fs.readdirSync(RULES_DIR).filter((file) => file.endsWith(".md") && file !== "README.md");
}

function loadPosts() {
  const data = loadYaml(BOARD_FILE, { posts: [] });
  return Array.isArray(data.posts) ? data.posts : [];
}

function unresolvedSchoolPosts(posts) {
  return posts.filter((post) => post.author === "school-watch" && post.status !== "done");
}

function addPost(posts, body, kind) {
  const maxId = posts.reduce((max, item) => {
    const match = String(item.id || "").match(/^post_(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  posts.push({
    id: `post_${String(maxId + 1).padStart(3, "0")}`,
    body,
    author: "school-watch",
    kind,
    status: "new",
    created_at: now(),
    response: null,
  });
}

function createCandidates(posts) {
  const candidates = [];
  const schoolPosts = unresolvedSchoolPosts(posts);
  const newsState = loadYaml(NEWS_STATE_FILE, {});
  const pendingLibrary = countPendingLibrary();
  const boardBodies = new Set(schoolPosts.map((post) => String(post.body || "")));

  const maybePush = (body, kind, reason) => {
    if (boardBodies.has(body)) return;
    candidates.push({ body, kind, reason });
  };

  if (ageHours(newsState.last_checked_at) > 24) {
    maybePush(
      "学校巡回: AI記事巡回が止まっている。OpenAI / Anthropic / Zenn を見て図書館カウンターに本を入れる。",
      "patrol",
      "news watch stale"
    );
  }

  const shelfIndexFile = fs.existsSync(SHELF_INDEX_FILE) ? SHELF_INDEX_FILE : FALLBACK_SHELF_INDEX_FILE;
  if (!fs.existsSync(shelfIndexFile) || ageHours(fs.statSync(shelfIndexFile).mtime.toISOString()) > 24) {
    maybePush(
      "学校巡回: 図書館の書架 index が古い。棚を更新して、何がどこにあるか見えるようにする。",
      "patrol",
      "library shelf missing or stale"
    );
  }

  if (ruleFiles().length < 3) {
    maybePush(
      "学校巡回: 校則がまだ薄い。繰り返し困ることを再発防止のルールとして追加する。",
      "rule-candidate",
      "rulebook is still thin"
    );
  }

  if (pendingLibrary > 0) {
    maybePush(
      `学校巡回: 図書館カウンターに未処理が ${pendingLibrary} 件ある。摩耶花に整理を回してもらう。`,
      "patrol",
      "library queue has pending items"
    );
  }

  const recurringPain = posts.filter((post) => {
    const body = String(post.body || "");
    return /困|迷|詰|漏|弱|遅|崩/.test(body) && post.status !== "done";
  });
  if (recurringPain.length >= 2) {
    maybePush(
      "学校巡回: 掲示板に困りごと系のメモが溜まっている。単発メモで終わらせず、校則候補か改善依頼にまとめ直す。",
      "rule-candidate",
      "recurring pain points on board"
    );
  }

  return candidates;
}

function main() {
  const apply = process.argv.includes("--apply");
  const data = loadYaml(BOARD_FILE, { posts: [] });
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const candidates = createCandidates(posts);

  if (candidates.length === 0) {
    console.log("board-scout: actionable candidate not found");
    return;
  }

  for (const candidate of candidates) {
    console.log(`- ${candidate.body}`);
    console.log(`  reason: ${candidate.reason}`);
    if (apply) {
      addPost(posts, candidate.body, candidate.kind);
    }
  }

  if (apply) {
    data.posts = posts;
    saveYaml(BOARD_FILE, data);
    console.log(`board-scout: added ${candidates.length} post(s)`);
  }
}

main();
