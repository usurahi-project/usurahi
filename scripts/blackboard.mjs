#!/usr/bin/env node

//=============================================================================
// blackboard.mjs — 黒板ペインの描画
//=============================================================================
// 以前は blackboard.md を cat していた。あれは gijiroku.yaml を人間向けの
// markdown へ平坦化したもので、ペインはさらにそれを生のまま流していた。
// 結果、見出し記号と空欄の `---` が画面の大半を占め、いま誰にボールがあるかは
// ペインの枠（120字に切り詰めたラベル）を読まないと分からなかった。
//
// ここでは状態から直接描く。空の欄は描かない。狭いペインでも読めるよう、
// 幅は実際の端末幅に合わせる。
//
// Usage:
//   node scripts/blackboard.mjs          描画する（黒板ペインのループから呼ぶ）
//   node scripts/blackboard.mjs --width 60   幅を指定して描画する
//=============================================================================

import { applyHighlight, currentBallHolder, readMeetingState } from "./meeting-highlight.mjs";
import { MEMBERS } from "./herdr.mjs";
import { clip, padEnd, roster, width, wrap } from "./roster.mjs";

const PHASE_LABELS = {
  clarifying: "確認中",
  shared: "共有済み",
  discussing: "議論中",
  waiting: "返答待ち",
  preparing_response: "返答準備",
  ready_to_return: "依頼者確認",
  done: "完了",
};

// workflow.md の提出条件。ready_to_return はこれが揃った時だけ立つ。
const CHECKS = [
  ["scoped", "範囲"],
  ["direction_set", "方向"],
  ["feasibility_checked", "可否"],
  ["expectation_matched", "期待値"],
  ["ready_to_return", "提出"],
];

const INDENT = "  ";
const MIN_WIDTH = 32;

/** 文字列・配列・null を行の配列に均す。空欄は空配列にして、呼び出し側で丸ごと落とす。 */
export function toLines(value) {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (item === null || item === undefined) return "";
      if (typeof item === "object") return String(item.text || item.title || item.value || "");
      return String(item);
    })
    .map((text) => text.trim())
    .filter((text) => text && text !== "---" && text !== "なし");
}

export function renderChecks(check = {}) {
  return CHECKS.map(([key, label]) => `${check[key] ? "✓" : "□"}${label}`).join(" ");
}

const BODY_INDENT = `${INDENT}   `;

/** 見出しと本文。本文が空なら何も返さない（空欄で画面を埋めない）。 */
function section(heading, value, columns) {
  const lines = toLines(value);
  if (!lines.length) return [];

  const body = lines.flatMap((line) =>
    wrap(line, columns - width(BODY_INDENT)).map((part) => BODY_INDENT + part),
  );
  return ["", `${INDENT} ${heading}`, ...body];
}

export function renderBoard(meeting, members, columns = 48) {
  const cols = Math.max(MIN_WIDTH, columns) - 2;
  const rule = INDENT + "─".repeat(cols);

  if (!meeting) {
    const murmur = renderMurmurBlock(members, cols);
    return [`${INDENT} 依頼はまだありません`, ...(murmur.length ? [rule, ...murmur] : [])];
  }

  const progress = meeting.progress || {};
  const holder = currentBallHolder(meeting);
  const ball = holder ? `● ${MEMBERS[holder]?.label || holder}` : "";
  const phase = PHASE_LABELS[meeting.phase] || String(meeting.phase || "");

  // 見出し行は左にフェーズ、右にボール。この2つだけは常に同じ位置に出す。
  const head = INDENT + " " + padEnd(phase, Math.max(0, cols - width(ball) - 2)) + ball;

  const board = meeting.blackboard || {};
  const lines = [head, rule];

  const nextAction = toLines(progress.next_action);
  if (nextAction.length) lines.push(`${INDENT} 次の一手  ${clip(nextAction[0], cols - 12)}`);
  lines.push(`${INDENT} 提出条件  ${renderChecks(progress.completion_check)}`);

  lines.push(
    ...section("依頼", board.request ?? meeting.why?.request, cols),
    ...section("決まったこと", board.decisions ?? meeting.how?.decisions, cols),
    ...section("完了", board.done ?? meeting.how?.done, cols),
    ...section("結論", board.conclusion ?? meeting.what?.conclusion, cols),
  );

  const murmur = renderMurmurBlock(members, cols);
  if (murmur.length) lines.push("", rule, ...murmur);
  return lines;
}

/**
 * 在室している部員の状態と、今考えている見出し。
 * 状態の語は部員ごとに長さが違う（「退屈」と「お待ちしています」）ので、
 * 列幅は固定せず実際の語に合わせる。固定にすると長い語が見出しを食う。
 */
export function renderMurmurBlock(members, cols) {
  const present = members.filter((m) => m.present);
  if (!present.length) return [];

  const nameCell = Math.max(...present.map((m) => width(m.label))) + 2;
  const stateCell = Math.max(...present.map((m) => width(m.state))) + 2;
  const titleCell = cols - nameCell - stateCell - 2;

  return present.map((m) =>
    `${INDENT} ${padEnd(m.label, nameCell)}${padEnd(m.state, stateCell)}${
      titleCell >= 8 ? clip(m.title, titleCell) : ""
    }`.trimEnd(),
  );
}

//--- CLI --------------------------------------------------------------------

async function main() {
  const flag = process.argv.indexOf("--width");
  const columns =
    flag >= 0 ? Number(process.argv[flag + 1]) : process.stdout.columns || Number(process.env.COLUMNS) || 48;

  const meeting = readMeetingState();
  // 表示（黒板）と状態の反映（ペインのメタデータ）を1プロセスにまとめる。
  // 部室が閉じている・herdr が居ない時は描画だけ続ける。
  const members = await roster().catch(() => []);
  await applyHighlight(currentBallHolder(meeting)).catch(() => false);

  console.log(renderBoard(meeting, members, columns).join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
