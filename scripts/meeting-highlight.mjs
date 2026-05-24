#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import yaml from "js-yaml";

const BASEDIR = process.env.USURAHI_BASEDIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GIJIROKU_FILE = path.join(BASEDIR, "queue", "gijiroku.yaml");
const CLUBROOM_SESSION = process.env.USURAHI_CLUBROOM_SESSION || "clubroom";
const NOTICEBOARD_SESSION = process.env.USURAHI_NOTICEBOARD_SESSION || "noticeboard";

const MEMBERS = new Set(["eru", "haruhi", "oreki", "kyon", "nagato"]);
const MEMBER_LABELS = {
  eru: "える",
  haruhi: "ハルヒ",
  oreki: "折木",
  kyon: "キョン",
  nagato: "長門",
};

const PANE_TARGETS = {
  eru: [`${NOTICEBOARD_SESSION}.0`, `${CLUBROOM_SESSION}.4`],
  haruhi: [`${CLUBROOM_SESSION}.0`],
  oreki: [`${CLUBROOM_SESSION}.1`],
  kyon: [`${CLUBROOM_SESSION}.3`],
  nagato: [`${CLUBROOM_SESSION}.5`],
};

const BASE_TITLES = {
  [`${NOTICEBOARD_SESSION}.0`]: "える",
  [`${CLUBROOM_SESSION}.0`]: "ハルヒ",
  [`${CLUBROOM_SESSION}.1`]: "折木",
  [`${CLUBROOM_SESSION}.2`]: "黒板",
  [`${CLUBROOM_SESSION}.3`]: "キョン",
  [`${CLUBROOM_SESSION}.4`]: "える",
  [`${CLUBROOM_SESSION}.5`]: "長門",
};

export function readMeetingState(filePath = GIJIROKU_FILE) {
  if (!fs.existsSync(filePath)) return null;
  const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
  return data.meeting || null;
}

export function normalizeMember(value) {
  const normalized = String(value || "").trim();
  return MEMBERS.has(normalized) ? normalized : "";
}

export function currentBallHolder(meeting) {
  if (!meeting || typeof meeting !== "object") return "";
  const waitingFor = normalizeMember(meeting.progress?.waiting_for);
  if (waitingFor) return waitingFor;
  return normalizeMember(meeting.progress?.owner);
}

export function paneTitle(target, holder) {
  const baseTitle = BASE_TITLES[target] || target;
  if (!holder || !(PANE_TARGETS[holder] || []).includes(target)) return baseTitle;
  return `● ${baseTitle}`;
}

function tmux(args) {
  try {
    execFileSync("tmux", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tmuxSessionExists(sessionName) {
  return tmux(["has-session", "-t", sessionName]);
}

export function applyHighlight(holder) {
  if (!tmuxSessionExists(CLUBROOM_SESSION) && !tmuxSessionExists(NOTICEBOARD_SESSION)) return;

  const highlightedTargets = new Set(holder ? PANE_TARGETS[holder] || [] : []);
  for (const [target, baseTitle] of Object.entries(BASE_TITLES)) {
    const isHighlighted = highlightedTargets.has(target);
    tmux(["select-pane", "-t", target, "-T", isHighlighted ? `● ${baseTitle}` : baseTitle]);
    tmux(["select-pane", "-t", target, "-P", isHighlighted ? "fg=yellow,bold" : "fg=colour240"]);
  }

  const label = holder ? MEMBER_LABELS[holder] || holder : "なし";
  tmux(["set-option", "-t", CLUBROOM_SESSION, "status-right", ` ボール: ${label} `]);
}

function main() {
  const meeting = readMeetingState();
  const holder = currentBallHolder(meeting);
  applyHighlight(holder);

  if (process.argv.includes("--print")) {
    console.log(holder || "none");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
