#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUEUE_FILE = path.join(BASEDIR, "queue", "library_queue.yaml");

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

function resetForRetry(item) {
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
  delete item.saved_path;
  delete item.duplicate_of;
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--failed") {
    return { mode: "failed" };
  }

  if (argv.length === 1 && argv[0]) {
    return { mode: "url", url: argv[0] };
  }

  throw new Error("usage: ./library.sh retry <url> | ./library.sh retry --failed");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = loadQueue();
  const items = Array.isArray(queue.urls) ? queue.urls : [];

  const targets = args.mode === "failed"
    ? items.filter((item) => item.status === "failed")
    : items.filter((item) => item.url === args.url && item.status === "failed");

  if (targets.length === 0) {
    if (args.mode === "failed") {
      console.log("⚠ 再試行に戻す失敗URLはない");
      return;
    }
    console.log(`⚠ 指定URLで failed のものはない: ${args.url}`);
    return;
  }

  for (const item of targets) {
    resetForRetry(item);
  }

  saveQueue(queue);

  if (args.mode === "failed") {
    console.log(`✓ ${targets.length}件を再試行に戻した`);
    return;
  }

  console.log(`✓ 再試行に戻した: ${targets[0].url}`);
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
