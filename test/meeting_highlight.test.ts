import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

type HighlightModule = {
  currentBallHolder: (meeting: unknown) => string;
  normalizeMember: (value: unknown) => string;
  paneTitle: (target: string, holder: string) => string;
};

async function loadHighlightModule(): Promise<HighlightModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "meeting-highlight.mjs")).href;
  return await import(moduleUrl) as HighlightModule;
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

  assert.equal(highlight.paneTitle("clubroom.3", "kyon"), "● キョン");
  assert.equal(highlight.paneTitle("clubroom.1", "kyon"), "折木");
});
