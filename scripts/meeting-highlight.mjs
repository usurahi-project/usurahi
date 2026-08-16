#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  MEMBERS,
  METADATA_SOURCE,
  call,
  findClubroom,
  panesByLabel,
} from "./herdr.mjs";

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
export function displayAgent(target, holder) {
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
 * ボール保持者に ● を付け、agent_status を部員の語彙に差し替える。
 *
 * どちらも pane.report_metadata で出す。以前は pane.rename でラベルそのものを
 * 書き換えていたが、ラベルは宛先解決のキーでもあるため、表示のたびに宛先が
 * 変わってしまい paneKey() で飾りを剥がし直す必要があった。表示は表示として
 * 別の器に置く。report_metadata は display-only で label に触らない。
 *
 * 会議サマリは黒板ペインのラベルへ 120 字に切り詰めて押し込んでいたが、
 * 黒板そのものが状態から描くようになったので不要になった（blackboard.mjs）。
 */
export async function applyHighlight(holder) {
  const clubroom = await findClubroom();
  if (!clubroom) return false;

  const panes = await panesByLabel(clubroom.workspace_id);

  for (const member of Object.values(MEMBERS)) {
    const paneId = panes.get(member.label);
    if (!paneId) continue;
    await call("pane.report_metadata", {
      pane_id: paneId,
      source: METADATA_SOURCE,
      display_agent: displayAgent(member.label, holder),
      state_labels: member.states,
    });
  }

  return true;
}

async function main() {
  const meeting = readMeetingState();
  const holder = currentBallHolder(meeting);
  const summary = meetingSummary(meeting);

  // 部室が閉じている・herdr が居ない場合は黙って何もしない（黒板の cat は続く）
  await applyHighlight(holder).catch(() => false);

  if (process.argv.includes("--print")) {
    console.log(`${holder || "none"}\t${summary.phase}\t${summary.nextAction}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
