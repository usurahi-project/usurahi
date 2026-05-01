#!/usr/bin/env node

import { latestFailedEntries, loadPendingQueue, savePendingQueue, findLatestHistoryByUrl } from "./library-queue-store.mjs";

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

function cloneForPending(item) {
  return JSON.parse(JSON.stringify(item));
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

function selectTargets(args) {
  if (args.mode === "failed") {
    return latestFailedEntries();
  }
  return [findLatestHistoryByUrl(args.url)].filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = loadPendingQueue();
  const items = Array.isArray(queue.urls) ? queue.urls : [];
  const sourceTargets = selectTargets(args);
  const targets = [];

  for (const entry of sourceTargets) {
    if (items.some((item) => item.url === entry.url && item.status === "pending")) continue;
    const cloned = cloneForPending(entry);
    resetForRefetch(cloned);
    items.push(cloned);
    targets.push(cloned);
  }

  if (targets.length === 0) {
    if (args.mode === "failed") {
      console.log("⚠ 再取得に戻す失敗URLはない");
      return;
    }
    console.log(`⚠ 指定URLで refetch 対象のものはない: ${args.url}`);
    return;
  }

  savePendingQueue(queue);

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
