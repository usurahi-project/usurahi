import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const root = process.cwd();

async function runReception(args: string[]) {
  return await execFileAsync("bash", [path.join(root, "usurahi.sh"), ...args], {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
}

test("reception help presents a single entrypoint and routes", async () => {
  const { stdout } = await runReception(["--help"]);

  assert.match(stdout, /Usage:/);
  assert.match(stdout, /\.\/usurahi\.sh tutorial/);
  assert.match(stdout, /\.\/usurahi\.sh start/);
  assert.match(stdout, /\.\/usurahi\.sh status/);
  assert.match(stdout, /\.\/usurahi\.sh board/);
  assert.match(stdout, /\.\/usurahi\.sh library/);
});

test("reception status explains the next available commands", async () => {
  const { stdout } = await runReception(["status"]);

  assert.match(stdout, /今の状態/);
  assert.match(stdout, /今は進行中の会議はありません|フェーズ:/);
  assert.match(stdout, /会議を始める: \.\/usurahi\.sh start/);
  assert.match(stdout, /部室を見る:\s+\.\/usurahi\.sh room/);
  assert.match(stdout, /掲示板:\s+\.\/usurahi\.sh board list/);
  assert.match(stdout, /図書館:\s+\.\/usurahi\.sh library list/);
});

test("tutorial explains the first-time structure and next command", async () => {
  const { stdout } = await runReception(["tutorial"]);

  assert.match(stdout, /薄氷 3分チュートリアル/);
  assert.match(stdout, /\.\/usurahi\.sh/);
  assert.match(stdout, /tmux attach -t clubroom/);
  assert.match(stdout, /● 名前/);
  assert.match(stdout, /\.\/usurahi\.sh start --setup/);
  assert.match(stdout, /ユーザーは依頼を持ち込み/);
});

test("README and UX docs document the reception entrypoint", async () => {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const ux = await readFile(path.join(root, "docs", "reception-ux.md"), "utf8");
  const tutorial = await readFile(path.join(root, "docs", "tutorial.md"), "utf8");
  const command = await readFile(path.join(root, ".claude", "commands", "tutorial.md"), "utf8");
  const packageJson = await readFile(path.join(root, "package.json"), "utf8");

  assert.ok(readme.includes("./usurahi.sh"), "README should expose the reception entrypoint");
  assert.ok(readme.includes("docs/tutorial.md"), "README should link tutorial docs");
  assert.ok(readme.includes("docs/reception-ux.md"), "README should link reception UX docs");
  assert.ok(ux.includes("既存スクリプトへ委譲する"), "UX doc should keep reception as a thin layer");
  assert.ok(tutorial.includes("3分チュートリアル"), "tutorial doc should be the onboarding source");
  assert.ok(command.includes("docs/tutorial.md"), "slash command should point to the tutorial source");
  assert.ok(packageJson.includes("reception:status"), "package.json should expose a reception status script");
  assert.ok(packageJson.includes("\"tutorial\""), "package.json should expose a tutorial script");
});
