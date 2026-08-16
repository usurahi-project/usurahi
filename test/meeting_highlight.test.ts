import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

type HighlightModule = {
  currentBallHolder: (meeting: unknown) => string;
  meetingSummary: (meeting: unknown) => { phase: string; holder: string; nextAction: string };
  normalizeMember: (value: unknown) => string;
  displayAgent: (target: string, holder: string) => string;
};

type HerdrModule = {
  paneKey: (label: string) => string;
  MEMBERS: Record<string, { label: string; states?: Record<string, string> }>;
  BLACKBOARD_LABEL: string;
};

async function loadHighlightModule(): Promise<HighlightModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "meeting-highlight.mjs")).href;
  return await import(moduleUrl) as HighlightModule;
}

async function loadHerdrModule(): Promise<HerdrModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "herdr.mjs")).href;
  return await import(moduleUrl) as HerdrModule;
}

test("meeting highlight prefers waiting_for when it is a member", async () => {
  const highlight = await loadHighlightModule();
  const holder = highlight.currentBallHolder({
    progress: {
      owner: "eru",
      waiting_for: "nagato",
    },
  });

  assert.equal(holder, "nagato");
});

test("meeting highlight falls back to owner when waiting_for is requester input", async () => {
  const highlight = await loadHighlightModule();
  const holder = highlight.currentBallHolder({
    progress: {
      owner: "eru",
      waiting_for: "requester_input",
    },
  });

  assert.equal(holder, "eru");
});

test("meeting highlight ignores unknown holders", async () => {
  const highlight = await loadHighlightModule();

  assert.equal(highlight.normalizeMember("requester"), "");
  assert.equal(highlight.currentBallHolder({ progress: { owner: "requester" } }), "");
});

test("meeting highlight marks only the holder", async () => {
  const highlight = await loadHighlightModule();

  assert.equal(highlight.displayAgent("キョン", "kyon"), "● キョン");
  assert.equal(highlight.displayAgent("折木", "kyon"), "折木");
});

test("every member has its own vocabulary for the shared agent states", async () => {
  const herdr = await loadHerdrModule();

  // 同じ agent_status を部員ごとに違う言葉で出す。ここが欠けると herdr の
  // 生の状態名（idle/working）がそのまま枠に出て、部室が計器盤に戻る。
  const seen = new Map<string, string>();
  for (const [key, member] of Object.entries(herdr.MEMBERS)) {
    for (const status of ["idle", "working", "blocked", "done"]) {
      const word = member.states?.[status];
      assert.ok(word, `${key}: ${status} の言葉がない`);

      const owner = seen.get(word);
      assert.equal(owner, undefined, `"${word}" が ${owner} と ${key} で重複している`);
      seen.set(word, key);
    }
  }
});

test("pane addressing survives the blackboard summary and legacy labels", async () => {
  const herdr = await loadHerdrModule();

  // 表示はメタデータへ移したので、部員のラベルはもう装飾されない。
  // `● 名前` は旧版で開いたままの部室に当たった時のための後方互換。
  for (const member of Object.values(herdr.MEMBERS)) {
    assert.equal(herdr.paneKey(member.label), member.label);
    assert.equal(herdr.paneKey(`● ${member.label}`), member.label);
  }

  // 黒板は会議サマリで装飾される
  assert.equal(
    herdr.paneKey(`${herdr.BLACKBOARD_LABEL} | 議論中 | ボール:える | 次:decide_next_step`),
    herdr.BLACKBOARD_LABEL,
  );
});

test("meeting summary exposes phase, holder, and next action", async () => {
  const highlight = await loadHighlightModule();
  const summary = highlight.meetingSummary({
    phase: "discussing",
    progress: {
      owner: "haruhi",
      waiting_for: null,
      next_action: "propose_direction",
    },
  });

  assert.deepEqual(summary, {
    phase: "議論中",
    holder: "ハルヒ",
    nextAction: "propose_direction",
  });
});
