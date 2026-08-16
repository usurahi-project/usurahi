#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import { MEMBERS, BLACKBOARD_LABEL, call, findClubroom, panesByLabel } from "./herdr.mjs";

const BASEDIR = process.env.USURAHI_BASEDIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GIJIROKU_FILE = path.join(BASEDIR, "queue", "gijiroku.yaml");

const MEMBER_LABELS = Object.fromEntries(
  Object.entries(MEMBERS).map(([key, member]) => [key, member.label]),
);

const PHASE_LABELS = {
  clarifying: "確認中",
  shared: "共有済み",
  discussing: "議論中",
  waiting: "返答待ち",
  preparing_response: "返答準備",
  ready_to_return: "依頼者確認",
  done: "完了",
};

export function readMeetingState(filePath = GIJIROKU_FILE) {
  if (!fs.existsSync(filePath)) return null;
  const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
  return data.meeting || null;
}

export function normalizeMember(value) {
  const normalized = String(value || "").trim();
  return Object.hasOwn(MEMBERS, normalized) ? normalized : "";
}

export function currentBallHolder(meeting) {
  if (!meeting || typeof meeting !== "object") return "";
  const waitingFor = normalizeMember(meeting.progress?.waiting_for);
  if (waitingFor) return waitingFor;
  return normalizeMember(meeting.progress?.owner);
}

/** target はペイン番号ではなくペインの名前（表の呼び名）。 */
export function paneTitle(target, holder) {
  if (!holder || MEMBER_LABELS[holder] !== target) return target;
  return `● ${target}`;
}

export function meetingSummary(meeting) {
  if (!meeting || typeof meeting !== "object") {
    return { phase: "なし", holder: "なし", nextAction: "なし" };
  }

  const holder = currentBallHolder(meeting);
  const phase = PHASE_LABELS[meeting.phase] || String(meeting.phase || "なし");
  const nextAction = String(meeting.progress?.next_action || "なし").trim() || "なし";

  return {
    phase,
    holder: holder ? MEMBER_LABELS[holder] || holder : "なし",
    nextAction,
  };
}

/**
 * ボール保持者のペイン名に ● を付ける。黒板ペインの名前には会議サマリを載せる
 * （tmux の status-right に相当する表示先が herdr には無いため）。
 */
export async function applyHighlight(holder, summary) {
  const clubroom = await findClubroom();
  if (!clubroom) return false;

  const panes = await panesByLabel(clubroom.workspace_id);

  for (const label of Object.values(MEMBER_LABELS)) {
    const paneId = panes.get(label);
    if (!paneId) continue;
    await call("pane.rename", { pane_id: paneId, label: paneTitle(label, holder) });
  }

  const blackboardPane = panes.get(BLACKBOARD_LABEL);
  if (blackboardPane && summary) {
    const status = `${BLACKBOARD_LABEL} | ${summary.phase} | ボール:${summary.holder} | 次:${summary.nextAction}`;
    await call("pane.rename", { pane_id: blackboardPane, label: status.slice(0, 120) });
  }

  return true;
}

async function main() {
  const meeting = readMeetingState();
  const holder = currentBallHolder(meeting);
  const summary = meetingSummary(meeting);

  // 部室が閉じている・herdr が居ない場合は黙って何もしない（黒板の cat は続く）
  await applyHighlight(holder, summary).catch(() => false);

  if (process.argv.includes("--print")) {
    console.log(`${holder || "none"}\t${summary.phase}\t${summary.nextAction}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
