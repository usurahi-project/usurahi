import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

type HighlightModule = {
  currentBallHolder: (meeting: unknown) => string;
  meetingSummary: (meeting: unknown) => { phase: string; holder: string; nextAction: string };
  normalizeMember: (value: unknown) => string;
  paneTitle: (target: string, holder: string) => string;
};

type HerdrModule = {
  paneKey: (label: string) => string;
  MEMBERS: Record<string, { label: string }>;
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

test("meeting highlight marks only the holder pane title", async () => {
  const highlight = await loadHighlightModule();

  assert.equal(highlight.paneTitle("キョン", "kyon"), "● キョン");
  assert.equal(highlight.paneTitle("折木", "kyon"), "折木");
});

test("pane addressing survives the highlight marker and the blackboard summary", async () => {
  const herdr = await loadHerdrModule();

  // ボール保持者のペインは `● 名前` に改名される。宛先解決がこれに引きずられると
  // 「ボールを持っている部員にだけ通知できない」という壊れ方をする。
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
