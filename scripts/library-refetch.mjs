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

function resetDraft(item) {
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

function resetForRefetch(item) {
  item.status = "pending";
  item.stage = "queued";
  resetDraft(item);

  if (item.source_type === "link") {
    item.fetched_text = "";
    return;
  }

  if (!item.excerpt) {
    item.text = "";
    item.fetched_text = "";
    if (item.source_type === "x") {
      item.fetch_status = "skipped";
    }
  }
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--failed") {
    return { mode: "failed" };
  }

  if (argv.length === 1 && argv[0]) {
    return { mode: "url", url: argv[0] };
  }

  throw new Error("usage: ./library.sh refetch <url> | ./library.sh refetch --failed");
}

function selectTargets(items, args) {
  if (args.mode === "failed") {
    return items.filter((item) => item.status === "failed");
  }
  return items.filter((item) => item.url === args.url && item.status !== "done");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = loadQueue();
  const items = Array.isArray(queue.urls) ? queue.urls : [];
  const targets = selectTargets(items, args);

  if (targets.length === 0) {
    if (args.mode === "failed") {
      console.log("⚠ 再取得に戻す失敗URLはない");
      return;
    }
    console.log(`⚠ 指定URLで refetch 対象のものはない: ${args.url}`);
    return;
  }

  for (const item of targets) {
    resetForRefetch(item);
  }

  saveQueue(queue);

  if (args.mode === "failed") {
    console.log(`✓ ${targets.length}件を再取得前提で戻した`);
    return;
  }

  console.log(`✓ 再取得前提で戻した: ${targets[0].url}`);
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
