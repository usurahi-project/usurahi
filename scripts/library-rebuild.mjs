#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUEUE_FILE = path.join(BASEDIR, "queue", "library_queue.yaml");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { urls: [] };
  }
  return yaml.load(fs.readFileSync(QUEUE_FILE, "utf8")) || { urls: [] };
}

function saveQueue(data) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

function resetForRebuild(item) {
  item.status = "pending";
  item.stage = "queued";
  item.normalized_text = "";
  item.error = null;
  item.processed_at = null;
  item.draft = { title: "", summary: "", tags: [], use_case: "" };
  delete item.title;
  delete item.summary;
  delete item.use_case;
  delete item.comment;
  delete item.tags;
  delete item.duplicate_of;
}

function backupSavedNote(item) {
  if (!item.saved_path) return null;

  const absolutePath = path.join(OBSIDIAN_USURAHI_DIR, item.saved_path);
  if (!fs.existsSync(absolutePath)) return null;

  const dir = path.dirname(absolutePath);
  const ext = path.extname(absolutePath);
  const base = path.basename(absolutePath, ext);
  const backupPath = path.join(dir, `${base}.bak-${nowStamp()}${ext}`);
  fs.renameSync(absolutePath, backupPath);
  return path.relative(OBSIDIAN_USURAHI_DIR, backupPath);
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0]) {
    return { url: argv[0] };
  }
  throw new Error("usage: ./library.sh rebuild <url>");
}

function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const queue = loadQueue();
  const items = Array.isArray(queue.urls) ? queue.urls : [];
  const item = items.find((entry) => entry.url === url);

  if (!item) {
    console.log(`⚠ 指定URLは図書室キューにない: ${url}`);
    return;
  }

  const backupPath = backupSavedNote(item);
  resetForRebuild(item);
  delete item.saved_path;

  saveQueue(queue);

  const lines = [`✓ 作り直し待ちに戻した: ${url}`];
  if (backupPath) {
    lines.push(`  退避: ${backupPath}`);
  }
  console.log(lines.join("\n"));
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
