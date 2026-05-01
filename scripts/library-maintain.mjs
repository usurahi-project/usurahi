#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { execFile } from "child_process";
import { promisify } from "util";
import { loadPendingQueue, latestFailedEntries } from "./library-queue-store.mjs";

const execFileAsync = promisify(execFile);
const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const LIBRARY_DIR = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "開架");
const LOCKER_DIR = path.join(OBSIDIAN_USURAHI_DIR, "教室", "ロッカー");
const MAINTENANCE_LOG = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "摩耶花の整頓記録.md");
const PRODUCT_SPLIT_RULES = [
  { name: "Claude Code", requiredDirs: ["公式ドキュメント", "tips記事"] },
  { name: "Codex", requiredDirs: ["公式ドキュメント", "tips記事"] },
];

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

function readFrontmatter(content) {
  const match = String(content).match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  return yaml.load(match[1]) || {};
}

function queueStats() {
  const data = loadPendingQueue();
  const urls = Array.isArray(data.urls) ? data.urls : [];
  return {
    pending: urls.length,
    failed: latestFailedEntries().length,
  };
}

function libraryStats() {
  const files = walkMarkdownFiles(LIBRARY_DIR);
  let knowledge = 0;
  let missingSource = 0;
  let missingTopic = 0;

  for (const file of files) {
    const frontmatter = readFrontmatter(fs.readFileSync(file, "utf8"));
    if (frontmatter.type !== "knowledge") continue;
    knowledge += 1;
    if (!frontmatter.source) missingSource += 1;
    if (!frontmatter.topic) missingTopic += 1;
  }

  return { knowledge, missingSource, missingTopic };
}

function lockerStats() {
  const files = walkMarkdownFiles(LOCKER_DIR);
  let stable = 0;
  let draft = 0;

  for (const file of files) {
    const frontmatter = readFrontmatter(fs.readFileSync(file, "utf8"));
    if (frontmatter.type !== "research") continue;
    if (frontmatter.status === "stable") stable += 1;
    if (frontmatter.status === "draft") draft += 1;
  }

  return { stable, draft };
}

function productSplitStats() {
  let misplacedRootNotes = 0;
  let missingDirs = 0;

  for (const rule of PRODUCT_SPLIT_RULES) {
    const productDir = path.join(LIBRARY_DIR, rule.name);
    if (!fs.existsSync(productDir)) continue;

    for (const dirName of rule.requiredDirs) {
      if (!fs.existsSync(path.join(productDir, dirName))) missingDirs += 1;
    }

    for (const entry of fs.readdirSync(productDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") misplacedRootNotes += 1;
    }
  }

  return { misplacedRootNotes, missingDirs };
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function ensureMaintenanceLog() {
  if (fs.existsSync(MAINTENANCE_LOG)) return;
  fs.writeFileSync(
    MAINTENANCE_LOG,
    [
      "---",
      "type: guide",
      "status: stable",
      "topic: 図書館運用",
      `created: ${today()}`,
      `updated: ${today()}`,
      "---",
      "",
      "# 摩耶花の整頓記録",
      "",
      "摩耶花が定期整頓で見たことを短く残す。",
      "",
    ].join("\n"),
    "utf8",
  );
}

function appendMaintenanceLog(queue, library, locker, productSplit) {
  ensureMaintenanceLog();
  const line = `- ${today()} ${nowTime()} 整頓: 開架${library.knowledge}冊 / pending ${queue.pending} / failed ${queue.failed} / source欠け ${library.missingSource} / topic欠け ${library.missingTopic} / ロッカーstable ${locker.stable} / ロッカーdraft ${locker.draft} / 棚ずれ ${productSplit.misplacedRootNotes} / 分類不足 ${productSplit.missingDirs}`;
  const current = fs.readFileSync(MAINTENANCE_LOG, "utf8").trimEnd();
  fs.writeFileSync(MAINTENANCE_LOG, `${current}\n${line}\n`, "utf8");
}

async function runShelfRefresh() {
  const scriptPath = path.join(BASEDIR, "scripts", "library-shelf.mjs");
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], { cwd: BASEDIR });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

async function main() {
  await runShelfRefresh();

  const queue = queueStats();
  const library = libraryStats();
  const locker = lockerStats();
  const productSplit = productSplitStats();
  appendMaintenanceLog(queue, library, locker, productSplit);
  console.log(
    `摩耶花「棚は整えたわよ。開架${library.knowledge}冊、pending ${queue.pending}件、failed ${queue.failed}件、source欠け ${library.missingSource}件、topic欠け ${library.missingTopic}件、ロッカーstable ${locker.stable}件、棚ずれ ${productSplit.misplacedRootNotes}件。」`,
  );
}

main().catch((error) => {
  console.error(`library-maintain failed: ${error.message}`);
  process.exit(1);
});
