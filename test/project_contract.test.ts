import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

type PersonaContract = {
  file: string;
  name: string;
  primary: string[];
  forbidden: string[];
};

const personaContracts: PersonaContract[] = [
  {
    file: "instructions/eru.md",
    name: "える",
    primary: ["依頼受付", "背景掘り", "結論化"],
    forbidden: ["実装タスクの配車役にならない", "自分で技術可否を決めない"],
  },
  {
    file: "instructions/haruhi.md",
    name: "ハルヒ",
    primary: ["発火", "方向づけ", "停滞打破"],
    forbidden: ["実装の細部を詰めない", "最終レビュー責任者にならない"],
  },
  {
    file: "instructions/oreki.md",
    name: "折木",
    primary: ["抽出", "最小案", "最小修正"],
    forbidden: ["ずっと前面に立ち続けない", "結論の提出役にならない"],
  },
  {
    file: "instructions/kyon.md",
    name: "キョン",
    primary: ["制動", "現実チェック", "橋渡し", "出口確認"],
    forbidden: ["自分で最終結論を出さない", "ただ否定するだけで終わらない"],
  },
  {
    file: "instructions/nagato.md",
    name: "長門",
    primary: ["見極め", "可否判断", "実装"],
    forbidden: ["自発的な議論推進役にならない", "会議の結論を自分で閉じない"],
  },
  {
    file: "instructions/mayaka.md",
    name: "摩耶花",
    primary: ["図書室オペレータ", "知識を整理して残す"],
    forbidden: ["部会の進行", "黒板を更新しない"],
  },
];

async function readRepoFile(file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8");
}

test("persona instructions keep distinct reasons, duties, and boundaries", async () => {
  for (const contract of personaContracts) {
    const body = await readRepoFile(contract.file);
    assert.match(body, /## あなたは誰|## あなたは誰か/, `${contract.name}: identity section missing`);
    assert.match(body, /## 重心|## 何をするか/, `${contract.name}: role reason section missing`);
    assert.match(body, /## やらないこと|## 部会との境界/, `${contract.name}: boundary section missing`);

    for (const phrase of contract.primary) {
      assert.ok(body.includes(phrase), `${contract.name}: primary reason missing: ${phrase}`);
    }
    for (const phrase of contract.forbidden) {
      assert.ok(body.includes(phrase), `${contract.name}: boundary phrase missing: ${phrase}`);
    }
  }
});

test("clubroom roles are MECE enough for a conversation pipeline", async () => {
  const roleOwners = new Map<string, string>();

  for (const contract of personaContracts) {
    for (const duty of contract.primary) {
      const previousOwner = roleOwners.get(duty);
      assert.equal(previousOwner, undefined, `${duty} is duplicated by ${previousOwner} and ${contract.name}`);
      roleOwners.set(duty, contract.name);
    }
  }

  assert.deepEqual(
    [...roleOwners.values()].filter((owner) => owner !== "摩耶花").sort(),
    [
      "える",
      "える",
      "える",
      "キョン",
      "キョン",
      "キョン",
      "キョン",
      "ハルヒ",
      "ハルヒ",
      "ハルヒ",
      "折木",
      "折木",
      "折木",
      "長門",
      "長門",
      "長門",
    ].sort(),
  );
});

test("conversation instructions return control instead of leaving members waiting forever", async () => {
  const handoffFiles = personaContracts
    .filter((contract) => contract.name !== "摩耶花")
    .map((contract) => contract.file);

  for (const file of handoffFiles) {
    const body = await readRepoFile(file);
    assert.ok(body.includes("progress.waiting_for"), `${file}: progress.waiting_for contract missing`);
    assert.ok(body.includes("progress.owner"), `${file}: progress.owner contract missing`);
    assert.ok(body.includes("えるへ"), `${file}: return-to-eru handoff missing`);
    assert.ok(body.includes("progress.waiting_for: null"), `${file}: null waiting_for handoff missing`);
    assert.ok(!body.includes("progress.waiting_for: eru` は使う"), `${file}: should not wait on eru explicitly`);
  }
});

test("security defaults do not force permission bypass", async () => {
  const meeting = await readRepoFile("meeting.sh");
  const notify = await readRepoFile("scripts/notify.sh");
  const libraryRun = await readRepoFile("scripts/library-run.mjs");

  assert.ok(meeting.includes("USURAHI_DANGEROUS_SKIP_PERMISSIONS"), "meeting.sh should gate permission bypass by env");
  assert.ok(notify.includes("USURAHI_DANGEROUS_SKIP_PERMISSIONS"), "notify.sh should gate permission bypass by env");
  assert.ok(!libraryRun.includes("--dangerously-skip-permissions"), "library-run should not bypass permissions for summarization");
});

test("meeting setup wires tmux highlight refresh into the blackboard loop", async () => {
  const meeting = await readRepoFile("meeting.sh");
  const readme = await readRepoFile("README.md");
  const packageJson = await readRepoFile("package.json");

  assert.ok(meeting.includes("scripts/meeting-highlight.mjs"), "meeting.sh should refresh the ball holder highlight");
  assert.ok(readme.includes("● 名前"), "README should document the highlight marker");
  assert.ok(packageJson.includes("meeting:highlight"), "package.json should expose a manual highlight command");
});

test("blackboard render includes meeting status and completion checklist", async () => {
  const queueServer = await readRepoFile("mcp/queue-server.js");

  assert.ok(queueServer.includes("## 🟨 会議ステータス"), "blackboard should include a meeting status section");
  assert.ok(queueServer.includes("フェーズ"), "blackboard should show phase");
  assert.ok(queueServer.includes("次の一手"), "blackboard should show next action");
  assert.ok(queueServer.includes("完了条件"), "blackboard should show completion checks");
  assert.ok(queueServer.includes("renderCompletionCheck"), "completion checklist should be generated centrally");
});

test("meeting progress updates have a validated tool path", async () => {
  const queueServer = await readRepoFile("mcp/queue-server.js");
  const eru = await readRepoFile("instructions/eru.md");

  assert.ok(queueServer.includes("\"update_progress\""), "queue server should expose update_progress");
  assert.ok(queueServer.includes("validateProgressState"), "progress updates should be validated before writing");
  assert.ok(queueServer.includes("phase/progress は update_progress"), "generic update_meeting should not own progress fields");
  assert.ok(eru.includes("phase: preparing_response"), "eru should use preparing_response before requester handoff");
  assert.ok(eru.includes("phase: ready_to_return"), "eru should keep ready_to_return for requester handoff");
});

test("first-run setup creates runtime state and avoids fixed home paths", async () => {
  const meeting = await readRepoFile("meeting.sh");
  const claude = await readRepoFile("CLAUDE.md");
  const operations = await readRepoFile(".claude/rules/operations.md");

  assert.ok(meeting.includes("ensure_runtime_state"), "meeting setup should create runtime files on first run");
  assert.ok(meeting.includes("[[ -f \"$BASEDIR/blackboard.md\" ]] || write_default_blackboard"), "blackboard should exist before the tmux loop starts");
  assert.ok(meeting.includes("boot_text=\"${boot_text//\\~\\/usurahi/$BASEDIR}\""), "boot prompts should resolve repo-local paths");
  assert.ok(!meeting.includes("~/usurahi/meeting.sh -w"), "startup hints should not assume ~/usurahi");
  assert.ok(!claude.includes("~/usurahi/"), "CLAUDE.md should not assume a fixed clone path");
  assert.ok(!operations.includes("~/usurahi/"), "operation rules should not assume a fixed clone path");
});
