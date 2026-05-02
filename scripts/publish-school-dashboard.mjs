#!/usr/bin/env node

import fs from "fs";
import path from "path";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;
const SOURCE_DIR = path.join(BASEDIR, "dashboard", "dist");
const TARGET_DIR = path.join(OBSIDIAN_USURAHI_DIR, "職員室", "dashboard");

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function removeDirContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`dashboard dist not found: ${SOURCE_DIR}`);
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  removeDirContents(TARGET_DIR);
  copyDir(SOURCE_DIR, TARGET_DIR);
  console.log(`school-dashboard: published to ${TARGET_DIR}`);
}

main();
