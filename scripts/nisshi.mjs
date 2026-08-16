#!/usr/bin/env node

//=============================================================================
// nisshi.mjs — 朝礼と終礼、部誌への綴じ込み
//=============================================================================
// setup_sessions() は毎回 gijiroku.yaml と blackboard.md を白紙に戻す。
// 部室を閉じる前にその日の一件を部誌へ写しておかないと、翌日の朝礼で
// 「前回どこまで話したか」が残らない。継続性は演出ではなく、実際に前日の
// 文脈が戻ってくることでしか出ない。
//
// Usage:
//   node scripts/nisshi.mjs close   その日の一件を部誌へ綴じる（終礼）
//   node scripts/nisshi.mjs open    前回の続きを読み上げる（朝礼）
//=============================================================================

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { readMeetingState, meetingSummary } from "./meeting-highlight.mjs";

const BASEDIR =
  process.env.USURAHI_BASEDIR ||
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NISSHI_FILE = path.join(BASEDIR, "queue", "nisshi.yaml");
const BLACKBOARD_FILE = path.join(BASEDIR, "blackboard.md");

// 部誌は溜め込む物ではなく振り返る物なので、直近だけ残す。
const KEEP_ENTRIES = 30;

//--- 黒板の読み取り ----------------------------------------------------------

/** 黒板の見出し（## 📌 依頼 など）から本文を取る。未記入の `---` は空として扱う。 */
export function readSection(markdown, heading) {
  const lines = String(markdown).split("\n");
  const start = lines.findIndex((line) => line.startsWith("## ") && line.includes(heading));
  if (start < 0) return "";

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    body.push(line);
  }

  const text = body.join("\n").trim();
  return text === "---" || text === "なし" ? "" : text;
}

function readBlackboard() {
  if (!fs.existsSync(BLACKBOARD_FILE)) return { request: "", conclusion: "" };
  const markdown = fs.readFileSync(BLACKBOARD_FILE, "utf8");
  return {
    request: readSection(markdown, "依頼"),
    conclusion: readSection(markdown, "結論"),
  };
}

//--- 部誌 --------------------------------------------------------------------

export function loadNisshi(filePath = NISSHI_FILE) {
  if (!fs.existsSync(filePath)) return { entries: [] };
  const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
  return { entries: Array.isArray(data.entries) ? data.entries : [] };
}

function saveNisshi(nisshi, filePath = NISSHI_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(nisshi, { lineWidth: -1, noRefs: true }), "utf8");
}

/** その日の一件を1エントリに畳む。話が始まっていなければ綴じる物がない。 */
export function buildEntry(meeting, blackboard, closedAt) {
  const request = String(blackboard.request || "").trim();
  if (!meeting && !request) return null;

  const summary = meetingSummary(meeting);
  return {
    date: closedAt.slice(0, 10),
    closed_at: closedAt,
    request: request.split("\n")[0] || "（依頼なし）",
    phase: summary.phase,
    holder: summary.holder,
    next_action: summary.nextAction,
    conclusion: String(blackboard.conclusion || "").split("\n")[0] || "",
  };
}

//--- 表示 --------------------------------------------------------------------

export function renderClose(entry) {
  if (!entry) {
    return ["  ── 終礼 ──────────────────────", "     今日は綴じる一件がありませんでした"];
  }
  const lines = [
    "  ── 終礼 ──────────────────────",
    `     依頼   ${entry.request}`,
    `     状態   ${entry.phase} / ボール: ${entry.holder}`,
    `     次     ${entry.next_action}`,
  ];
  if (entry.conclusion) lines.push(`     結論   ${entry.conclusion}`);
  lines.push("     部誌に綴じました");
  return lines;
}

export function renderOpen(entry) {
  if (!entry) {
    return ["  ── 朝礼 ──────────────────────", "     持ち越しはありません。今日はここから始めます"];
  }
  const [, month, day] = entry.date.split("-");
  return [
    "  ── 朝礼 ──────────────────────",
    `     前回（${Number(month)}月${Number(day)}日）の続き`,
    `     依頼   ${entry.request}`,
    `     状態   ${entry.phase} / ボール: ${entry.holder}`,
    `     次     ${entry.next_action}`,
  ];
}

//--- CLI --------------------------------------------------------------------

const COMMANDS = {
  close() {
    const entry = buildEntry(readMeetingState(), readBlackboard(), new Date().toISOString());
    if (entry) {
      const nisshi = loadNisshi();
      nisshi.entries.push(entry);
      nisshi.entries = nisshi.entries.slice(-KEEP_ENTRIES);
      saveNisshi(nisshi);
    }
    console.log(renderClose(entry).join("\n"));
  },

  open() {
    const { entries } = loadNisshi();
    console.log(renderOpen(entries.at(-1) || null).join("\n"));
  },
};

function main() {
  const handler = COMMANDS[process.argv[2]];
  if (!handler) {
    console.error(`Usage: nisshi.mjs <${Object.keys(COMMANDS).join("|")}>`);
    process.exit(1);
  }
  handler();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
