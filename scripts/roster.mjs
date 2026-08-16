#!/usr/bin/env node

//=============================================================================
// roster.mjs — 昇降口の下駄箱と、部室のざわめき
//=============================================================================
// どちらも herdr の pane.list ひとつから描く。誰が来ているか（agent の有無）と、
// 今なにを考えているか（terminal_title_stripped）は、部室を開けば見えるはずの
// 情報なのに、これまでコマンドを叩かないと分からなかった。
//
// Usage:
//   node scripts/roster.mjs entrance   下駄箱を描く（在室＝靴がある）
//   node scripts/roster.mjs murmur     ざわめきを描く（黒板ループから呼ぶ）
//=============================================================================

import { MEMBERS, call, findClubroom, paneKey } from "./herdr.mjs";

const ORDER = ["eru", "haruhi", "oreki", "kyon", "nagato"];

/** 部員の在室と状態を、部室のペインから読む。部室が無ければ空。 */
export async function roster() {
  const clubroom = await findClubroom();
  if (!clubroom) return [];

  const { panes = [] } = await call("pane.list", { workspace_id: clubroom.workspace_id });
  const byName = new Map(panes.map((p) => [paneKey(p.label), p]));

  return ORDER.map((key) => {
    const member = MEMBERS[key];
    const pane = byName.get(member.label);
    // agent フィールドの有無が在室そのもの。agent_status はシェルでも unknown が返る。
    const present = Boolean(pane?.agent);
    const status = pane?.agent_status || "";
    return {
      key,
      label: member.label,
      present,
      status,
      // 状態は部員ごとの語彙に置き換える（herdr の枠に出るものと同じ言葉を使う）
      state: present ? member.states?.[status] || status : "",
      title: present ? pane?.terminal_title_stripped || "" : "",
    };
  });
}

//--- 幅計算 ------------------------------------------------------------------
// 全角を2列として数える。ここを間違えると罫線が揃わず、下駄箱が下駄箱に見えない。

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

export function width(text) {
  let n = 0;
  for (const ch of String(text)) n += WIDE.test(ch) ? 2 : 1;
  return n;
}

export function center(text, cell) {
  const pad = Math.max(0, cell - width(text));
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + text + " ".repeat(pad - left);
}

export function padEnd(text, cell) {
  return text + " ".repeat(Math.max(0, cell - width(text)));
}

/** セル幅で折り返す。日本語は単語境界を持たないので列数だけで折る。 */
export function wrap(text, cell) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    let n = 0;
    for (const ch of paragraph) {
      const w = WIDE.test(ch) ? 2 : 1;
      if (n + w > cell) {
        lines.push(line);
        line = "";
        n = 0;
      }
      line += ch;
      n += w;
    }
    lines.push(line);
  }
  return lines;
}

/** セル幅に収まるよう末尾を落とす。全角混じりでも列数で切る。 */
export function clip(text, cell) {
  let out = "";
  let n = 0;
  for (const ch of String(text)) {
    const w = WIDE.test(ch) ? 2 : 1;
    if (n + w > cell) return out + "…";
    out += ch;
    n += w;
  }
  return out;
}

//--- 下駄箱 ------------------------------------------------------------------

const CELL = 6; // 「ハルヒ」がちょうど収まる幅
const SHOE = "▄▄"; // meeting.sh のバナーと同じブロック文字を使う

export function renderEntrance(members) {
  if (!members.length) {
    return ["  昇降口は閉まっています（部室がまだ開いていません）"];
  }

  const bar = (l, m, r) => "  " + l + members.map(() => "─".repeat(CELL)).join(m) + r;
  const row = (cells) => "  │" + cells.map((c) => center(c, CELL)).join("│") + "│";

  const absent = members.filter((m) => !m.present).map((m) => m.label);
  const here = members.length - absent.length;

  const lines = [
    bar("┌", "┬", "┐"),
    row(members.map((m) => m.label)),
    bar("├", "┼", "┤"),
    row(members.map((m) => (m.present ? SHOE : ""))),
    bar("└", "┴", "┘"),
  ];

  lines.push(
    absent.length === 0
      ? `     在室 ${here} / ${members.length}     全員そろっています`
      : `     在室 ${here} / ${members.length}     ${absent.join("・")} はまだ来ていません`,
  );
  return lines;
}

//--- CLI --------------------------------------------------------------------

const COMMANDS = {
  async entrance() {
    console.log(renderEntrance(await roster()).join("\n"));
  },
};

async function main() {
  const handler = COMMANDS[process.argv[2]];
  if (!handler) {
    console.error(`Usage: roster.mjs <${Object.keys(COMMANDS).join("|")}>`);
    process.exit(1);
  }
  // 部室が閉じている・herdr が居ない時は黙って終わる（黒板ループを止めない）
  await handler().catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
