#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = process.env.USURAHI_BASEDIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const QUEUE_FILE = path.join(BASEDIR, "queue", "library_queue.yaml");
export const HISTORY_FILE = path.join(BASEDIR, "queue", "library_history.yaml");
const HISTORY_LIMIT = 200;

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readYaml(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, "utf8")) || fallback;
}

function writeYaml(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

export function timestamp() {
  return new Date().toISOString();
}

export function loadPendingQueue() {
  const data = readYaml(QUEUE_FILE, { urls: [] });
  const items = Array.isArray(data.urls) ? data.urls : [];
  const pending = items.filter((item) => item.status === "pending");
  const legacyHistory = items.filter((item) => item.status && item.status !== "pending");

  if (legacyHistory.length > 0) {
    const history = loadLibraryHistory();
    const migrated = legacyHistory.map((item) => ({
      ...JSON.parse(JSON.stringify(item)),
      history_recorded_at: item.history_recorded_at || timestamp(),
      migrated_from_queue_at: timestamp(),
    }));
    history.entries = [...migrated, ...history.entries].slice(0, HISTORY_LIMIT);
    saveLibraryHistory(history);
    writeYaml(QUEUE_FILE, { urls: pending });
  }

  return { urls: pending };
}

export function savePendingQueue(data) {
  const items = Array.isArray(data.urls) ? data.urls : [];
  writeYaml(QUEUE_FILE, { urls: items.filter((item) => item.status === "pending") });
}

export function loadLibraryHistory() {
  const data = readYaml(HISTORY_FILE, { entries: [] });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return { entries };
}

export function saveLibraryHistory(data) {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  writeYaml(HISTORY_FILE, { entries: entries.slice(0, HISTORY_LIMIT) });
}

export function recordLibraryHistory(item) {
  if (!item || !item.url || !item.status || item.status === "pending") return;
  const history = loadLibraryHistory();
  history.entries.unshift({
    ...JSON.parse(JSON.stringify(item)),
    history_recorded_at: timestamp(),
  });
  saveLibraryHistory(history);
}

export function latestHistoryEntries(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    if (!entry?.url) continue;
    if (map.has(entry.url)) continue;
    map.set(entry.url, entry);
  }
  return [...map.values()];
}

export function latestFailedEntries() {
  return latestHistoryEntries(loadLibraryHistory().entries).filter((entry) => entry.status === "failed");
}

export function findLatestHistoryByUrl(url) {
  if (!url) return null;
  return loadLibraryHistory().entries.find((entry) => entry.url === url) || null;
}
