import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

type Member = {
  key: string;
  label: string;
  present: boolean;
  status: string;
  state: string;
  title: string;
};

type RosterModule = {
  width: (text: string) => number;
  renderEntrance: (members: Member[]) => string[];
};

type BlackboardModule = {
  renderBoard: (meeting: unknown, members: Member[], columns?: number) => string[];
  renderMurmurBlock: (members: Member[], cols: number) => string[];
};

type NisshiModule = {
  readSection: (markdown: string, heading: string) => string;
  buildEntry: (
    meeting: unknown,
    blackboard: { request: string; conclusion: string },
    closedAt: string,
  ) => Record<string, string> | null;
  renderOpen: (entry: Record<string, string> | null) => string[];
  renderClose: (entry: Record<string, string> | null) => string[];
};

async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(path.join(process.cwd(), "scripts", file)).href)) as T;
}

function member(label: string, present: boolean, extra: Partial<Member> = {}): Member {
  return { key: label, label, present, status: "", state: "", title: "", ...extra };
}

const FIVE = [
  member("える", true),
  member("ハルヒ", true),
  member("折木", false),
  member("キョン", false),
  member("長門", true),
];

test("entrance box lines all have the same display width", async () => {
  const roster = await load<RosterModule>("roster.mjs");
  const lines = roster.renderEntrance(FIVE);

  // 全角の幅を1と数えると罫線がずれ、下駄箱が下駄箱に見えなくなる。
  const boxWidths = lines.slice(0, 5).map((line) => roster.width(line));
  assert.equal(new Set(boxWidths).size, 1, `枠の幅が揃っていない: ${boxWidths.join(",")}`);
});

test("entrance shows a shoe only for members who are here", async () => {
  const roster = await load<RosterModule>("roster.mjs");
  const lines = roster.renderEntrance(FIVE);
  const shoes = lines[3];

  assert.equal(shoes.match(/▄▄/g)?.length, 3);
  assert.match(lines[5], /在室 3 \/ 5/);
  assert.match(lines[5], /折木・キョン はまだ来ていません/);
});

test("entrance says so when nobody is missing", async () => {
  const roster = await load<RosterModule>("roster.mjs");
  const lines = roster.renderEntrance(FIVE.map((m) => ({ ...m, present: true })));

  assert.match(lines[5], /全員そろっています/);
});

test("entrance reports a closed clubroom instead of an empty box", async () => {
  const roster = await load<RosterModule>("roster.mjs");
  assert.match(roster.renderEntrance([])[0], /部室がまだ開いていません/);
});

test("murmur lists only members who are here, with their own vocabulary", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  const lines = board.renderMurmurBlock(
    [
      member("ハルヒ", true, { state: "ひらめいた", title: "依頼の方向を決める" }),
      member("折木", false, { state: "", title: "" }),
    ],
    60,
  );

  assert.equal(lines.filter((line) => line.includes("ハルヒ")).length, 1);
  assert.equal(lines.filter((line) => line.includes("折木")).length, 0);
  assert.ok(lines.some((line) => line.includes("ひらめいた") && line.includes("依頼の方向を決める")));
});

test("murmur stays silent when the clubroom is empty", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  assert.deepEqual(board.renderMurmurBlock([member("える", false)], 60), []);
});

test("a long state word does not eat the title column", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  const lines = board.renderMurmurBlock(
    [
      member("える", true, { state: "お待ちしています", title: "長門の返答を待つ" }),
      member("ハルヒ", true, { state: "退屈", title: "" }),
    ],
    60,
  );

  assert.ok(lines[0].includes("お待ちしています"));
  assert.ok(lines[0].includes("長門の返答を待つ"), "長い状態語のあとに見出しが残らない");
  assert.equal(lines[1], lines[1].trimEnd(), "空の見出しで行末に余白が残らない");
});

test("blackboard omits empty sections instead of printing placeholders", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  const text = board
    .renderBoard(
      {
        phase: "discussing",
        progress: { owner: "eru", waiting_for: null, next_action: "decide_next_step", completion_check: {} },
        blackboard: { request: "依頼の本文", decisions: [], done: [], conclusion: null },
      },
      [],
      48,
    )
    .join("\n");

  assert.ok(text.includes("依頼"));
  assert.ok(!text.includes("決まったこと"), "空の欄は見出しごと描かない");
  assert.ok(!text.includes("---"), "空欄の穴埋め記号を出さない");
  assert.ok(!text.includes("##"), "markdown の見出し記号を出さない");
});

test("blackboard shows the ball holder and the submission checklist", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  const text = board
    .renderBoard(
      {
        phase: "waiting",
        progress: {
          owner: "eru",
          waiting_for: "nagato",
          next_action: "check_feasibility",
          completion_check: { scoped: true, direction_set: true, feasibility_checked: false },
        },
        blackboard: { request: "依頼の本文" },
      },
      [],
      48,
    )
    .join("\n");

  assert.ok(text.includes("● 長門"), "ボール保持者が黒板に出る");
  assert.ok(text.includes("返答待ち"));
  assert.ok(text.includes("✓範囲"));
  assert.ok(text.includes("□可否"), "未達の提出条件が見える");
});

test("blackboard says so when no request has arrived", async () => {
  const board = await load<BlackboardModule>("blackboard.mjs");
  assert.match(board.renderBoard(null, [], 48).join("\n"), /依頼はまだありません/);
});

test("blackboard sections read as empty when they are placeholders", async () => {
  const nisshi = await load<NisshiModule>("nisshi.mjs");
  const markdown = ["# 黒板", "", "## 📌 依頼", "Ghostty を使ってみたい", "", "## 📝 結論", "---", ""].join("\n");

  assert.equal(nisshi.readSection(markdown, "依頼"), "Ghostty を使ってみたい");
  assert.equal(nisshi.readSection(markdown, "結論"), "");
  assert.equal(nisshi.readSection(markdown, "存在しない見出し"), "");
});

test("nisshi keeps nothing when the day never started", async () => {
  const nisshi = await load<NisshiModule>("nisshi.mjs");
  assert.equal(nisshi.buildEntry(null, { request: "", conclusion: "" }, "2026-08-16T10:00:00.000Z"), null);
});

test("nisshi folds the day into one entry the next morning can read", async () => {
  const nisshi = await load<NisshiModule>("nisshi.mjs");
  const entry = nisshi.buildEntry(
    { phase: "discussing", progress: { owner: "eru", waiting_for: null, next_action: "decide_next_step" } },
    { request: "Ghostty を使ってみたい\n（背景は省略）", conclusion: "" },
    "2026-08-16T10:00:00.000Z",
  );

  assert.deepEqual(entry, {
    date: "2026-08-16",
    closed_at: "2026-08-16T10:00:00.000Z",
    request: "Ghostty を使ってみたい",
    phase: "議論中",
    holder: "える",
    next_action: "decide_next_step",
    conclusion: "",
  });

  const morning = nisshi.renderOpen(entry);
  assert.ok(morning.some((line) => line.includes("8月16日")));
  assert.ok(morning.some((line) => line.includes("decide_next_step")));
});

test("morning assembly says so when there is nothing to carry over", async () => {
  const nisshi = await load<NisshiModule>("nisshi.mjs");
  assert.ok(nisshi.renderOpen(null).some((line) => line.includes("持ち越しはありません")));
  assert.ok(nisshi.renderClose(null).some((line) => line.includes("綴じる一件がありませんでした")));
});
