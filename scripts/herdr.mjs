#!/usr/bin/env node

//=============================================================================
// herdr.mjs — 薄氷と herdr の唯一の接点
//=============================================================================
// CLI (`herdr pane ...`) は socket API の薄いラッパだが引数名が推測しづらいので、
// ここでは socket に直接 {id, method, params} を投げる。
//
// Usage:
//   node scripts/herdr.mjs setup                  部室を作る（既存があれば閉じ直す）
//   node scripts/herdr.mjs kill                   部室を閉じる
//   node scripts/herdr.mjs launch <名前...>        部員を起動してブートを送る
//   node scripts/herdr.mjs notify <名前> <本文>     部員へ送信（未起動なら起動してから）
//   node scripts/herdr.mjs focus                  部室へ移動する
//   node scripts/herdr.mjs exists                 部室があれば exit 0
//=============================================================================

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASEDIR =
  process.env.USURAHI_BASEDIR ||
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOCKET =
  process.env.HERDR_SOCKET_PATH || path.join(os.homedir(), ".config", "herdr", "herdr.sock");
const WORKSPACE_LABEL = process.env.USURAHI_CLUBROOM_LABEL || "clubroom";

// herdr 0.7.5 の protocol。これ未満だと agent.* のスキーマが違う。
const MIN_PROTOCOL = 17;

// 表は世界観（label）、裏は実装名（キー）。CLAUDE.md 共通原則 4。
// states は herdr の agent_status（idle/working/blocked/done）を部員の語彙に置き換える。
// 同じ状態機械が、部員ごとに違う言葉でペインの枠に出る。
export const MEMBERS = {
  haruhi: {
    label: "ハルヒ",
    model: "claude-sonnet-4-5-20250929",
    boot: "haruhi_boot.txt",
  },
  oreki: {
    label: "折木",
    model: "claude-sonnet-4-5-20250929",
    boot: "oreki_boot.txt",
  },
  eru: {
    label: "える",
    model: "claude-opus-4-6",
    boot: "eru_boot.txt",
  },
  kyon: {
    label: "キョン",
    model: "claude-sonnet-4-5-20250929",
    boot: "kyon_boot.txt",
  },
  nagato: {
    label: "長門",
    model: "claude-sonnet-4-5-20250929",
    boot: "nagato_boot.txt",
  },
};

export const BLACKBOARD_LABEL = "黒板";

const START_TIMEOUT_MS = 90000;
// 相手が空くのを待つ上限。空けば送信を確認できるので、そちらを優先する。
// ただし待ち切らない場合は Claude Code の入力キューに積む。無制限に待つと、
// 部員どうしが同時にノックし合ったとき双方が相手待ちで固まる。
const RECEPTIVE_WAIT_MS = Number(process.env.USURAHI_RECEPTIVE_WAIT_MS || 30000);

//--- socket -----------------------------------------------------------------

let seq = 0;

export function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET);
    let buf = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try {
        sock.end();
      } catch {
        /* already closed */
      }
      fn(value);
    };

    sock.on("connect", () => {
      sock.write(JSON.stringify({ id: `usurahi:${method}:${++seq}`, method, params }) + "\n");
    });
    sock.on("data", (chunk) => {
      buf += chunk.toString();
      const i = buf.indexOf("\n");
      if (i < 0) return;
      let msg;
      try {
        msg = JSON.parse(buf.slice(0, i));
      } catch (e) {
        return finish(reject, new Error(`herdr の応答を解釈できません: ${e.message}`));
      }
      if (msg.error) {
        const err = new Error(`${method}: ${msg.error.message}`);
        err.code = msg.error.code;
        return finish(reject, err);
      }
      finish(resolve, msg.result);
    });
    sock.on("error", (e) => {
      finish(reject, new Error(`herdr に接続できません (${SOCKET}): ${e.message}`));
    });
    sock.on("close", () => {
      finish(reject, new Error(`${method}: 応答がないまま切断されました`));
    });
  });
}

export async function requirePrerequisites() {
  let pong;
  try {
    pong = await call("ping");
  } catch (e) {
    throw new Error(
      `${e.message}\n  herdr が動いていません。'herdr' を起動するか 'brew install herdr' を試してください。`,
    );
  }
  if (typeof pong.protocol === "number" && pong.protocol < MIN_PROTOCOL) {
    throw new Error(
      `herdr の protocol が古すぎます (${pong.protocol} < ${MIN_PROTOCOL}, version ${pong.version})。'herdr update' を実行してください。`,
    );
  }
  return pong;
}

//--- 部室の解決 --------------------------------------------------------------

export async function findClubroom() {
  const { workspaces = [] } = await call("workspace.list");
  return workspaces.find((w) => w.label === WORKSPACE_LABEL) || null;
}

async function requireClubroom() {
  const ws = await findClubroom();
  if (!ws) {
    throw new Error(`部室がありません（workspace '${WORKSPACE_LABEL}' 未作成）。先に meeting.sh を実行してください。`);
  }
  return ws;
}

/**
 * 表示上の飾りを落として、宛先キーとしての名前に戻す。
 * ラベルはボール保持者の `● ` や黒板の会議サマリで装飾されるが、
 * 宛先はその装飾に左右されてはいけない（番号ハードコードと同じ轍になる）。
 */
export const paneKey = (label) =>
  String(label || "")
    .replace(/^●\s*/, "")
    .split(" | ")[0]
    .trim();

/** 宛先名 -> pane_id。ペイン番号でも生ラベルでもなく、正規化した名前で引く。 */
export async function panesByLabel(workspaceId) {
  const { panes = [] } = await call("pane.list", { workspace_id: workspaceId });
  const map = new Map();
  for (const p of panes) {
    if (p.label) map.set(paneKey(p.label), p.pane_id);
  }
  return map;
}

export async function resolveMember(name) {
  const member = MEMBERS[name];
  if (!member) {
    throw new Error(`不明な送信先 '${name}'\n  使用可能: ${Object.keys(MEMBERS).join(", ")}`);
  }
  const ws = await requireClubroom();
  const panes = await panesByLabel(ws.workspace_id);
  const paneId = panes.get(member.label);
  if (!paneId) {
    throw new Error(`${member.label} のペインが部室に見つかりません。meeting.sh を実行し直してください。`);
  }
  return { ...member, key: name, paneId, workspaceId: ws.workspace_id };
}

//--- 部室の組み立て ----------------------------------------------------------

const pane = (label, extra = {}) => ({ type: "pane", label, cwd: BASEDIR, ...extra });
const column = (top, bottom) => ({
  type: "split",
  direction: "down",
  ratio: 0.5,
  first: top,
  second: bottom,
});

function clubroomLayout() {
  const blackboardLoop = [
    "bash",
    "-lc",
    `while true; do node ${JSON.stringify(path.join(BASEDIR, "scripts", "meeting-highlight.mjs"))}; clear; cat ${JSON.stringify(path.join(BASEDIR, "blackboard.md"))}; sleep 2; done`,
  ];

  // 3列 × 2段。左からハルヒ/折木、える/キョン、長門/黒板。
  return {
    type: "split",
    direction: "right",
    ratio: 1 / 3,
    first: column(pane(MEMBERS.haruhi.label), pane(MEMBERS.oreki.label)),
    second: {
      type: "split",
      direction: "right",
      ratio: 0.5,
      first: column(pane(MEMBERS.eru.label), pane(MEMBERS.kyon.label)),
      second: column(pane(MEMBERS.nagato.label), pane(BLACKBOARD_LABEL, { command: blackboardLoop })),
    },
  };
}

export async function setup() {
  await requirePrerequisites();

  const existing = await findClubroom();
  if (existing) {
    await call("workspace.close", { workspace_id: existing.workspace_id });
  }

  const created = await call("workspace.create", { label: WORKSPACE_LABEL, cwd: BASEDIR });
  const workspaceId = created.workspace.workspace_id;
  const tabId = created.tab.tab_id;

  // tab_id と workspace_id は排他。作ったタブを直接指す。
  await call("layout.apply", { tab_id: tabId, root: clubroomLayout() });

  // layout.apply はタブを作り直すので、tab_id を取り直してから名前を付ける
  const applied = await findClubroom();
  if (applied?.active_tab_id) {
    await call("tab.rename", { tab_id: applied.active_tab_id, label: "部室" });
  }

  const panes = await panesByLabel(workspaceId);
  const missing = [...Object.values(MEMBERS).map((m) => m.label), BLACKBOARD_LABEL].filter(
    (label) => !panes.has(label),
  );
  if (missing.length) {
    throw new Error(`ペインのラベル付けに失敗しました: ${missing.join(", ")}`);
  }

  return { workspaceId, panes };
}

export async function kill() {
  const ws = await findClubroom();
  if (!ws) return false;
  await call("workspace.close", { workspace_id: ws.workspace_id });
  return true;
}

//--- 部員の起動 --------------------------------------------------------------

function bootText(member) {
  const file = path.join(BASEDIR, "instructions", member.boot);
  return fs.readFileSync(file, "utf8").replaceAll("~/usurahi", BASEDIR).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAgent(paneId) {
  try {
    const res = await call("agent.get", { target: paneId });
    return res.agent || null;
  } catch (e) {
    if (e.code === "agent_not_found") return null; // エージェントが居ない（ただのシェル）
    throw e;
  }
}

/**
 * Claude Code の TUI が入力を受け付けるまで待つ。
 * agent.wait は登録直後に返ってしまい、その時点の agent.prompt は
 * "not an active named agent" で弾かれるので interactive_ready を見る。
 */
async function waitInteractive(paneId, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const agent = await getAgent(paneId);
    if (agent?.interactive_ready) return agent;
    await sleep(1000);
  }
  throw new Error(`${paneId}: 起動が ${Math.round(timeoutMs / 1000)} 秒で完了しませんでした`);
}

/**
 * 送ったプロンプトが処理され切るまで待つ。
 * agent_status は送信直後まだ working に切り替わっていないので、
 * 「一度 working を観測してから、そこを抜けるのを待つ」の二段で見る。
 * working を観測できないまま startTimeoutMs を過ぎたら、処理は既に終わったものとして進む。
 */
async function settle(paneId, { startTimeoutMs = 15000, timeoutMs = START_TIMEOUT_MS } = {}) {
  const startDeadline = Date.now() + startTimeoutMs;
  let sawWorking = false;
  while (Date.now() < startDeadline) {
    if ((await getAgent(paneId))?.agent_status === "working") {
      sawWorking = true;
      break;
    }
    await sleep(500);
  }
  if (!sawWorking) return { sawWorking, status: null };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = (await getAgent(paneId))?.agent_status;
    if (status && status !== "working") return { sawWorking, status };
    await sleep(1000);
  }
  return { sawWorking, status: null };
}

//--- 送信の直列化 ------------------------------------------------------------
// agent.prompt はテキストと Enter を TUI へ流し込む。前の送信が取り込まれる前に
// 次を送ると入力バッファが上書きされ、メッセージが文字化けもせず黙って消える。
//
// 同一ペインへ 6 本送って着弾数を数えた実測（Claude Code のセッション JSONL で計測。
// 端末のスクロールバックは読み落とすので当てにならない）:
//   ロックなし・同時   1/6
//   逐次              6/6
//   ロックあり・同時   6/6
//
// notify.sh は部員ごとに別プロセスで走るので、プロセスをまたぐロックで守る。

const LOCK_ROOT = path.join(BASEDIR, "queue", ".locks");
// 保持中は mtime を打ち続けるので、放置＝プロセス死と見なしてよい。
const LOCK_STALE_MS = 30000;
const LOCK_HEARTBEAT_MS = 5000;
// ロック保持は「相手待ち + 起動」で最長 2 分ほど。待ち行列を捌ける余裕を取る。
const LOCK_WAIT_MS = Number(process.env.USURAHI_SEND_LOCK_WAIT_MS || 300000);

async function withSendLock(key, fn) {
  const dir = path.join(LOCK_ROOT, key);
  fs.mkdirSync(LOCK_ROOT, { recursive: true });

  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let age = Infinity;
      try {
        age = Date.now() - fs.statSync(dir).mtimeMs;
      } catch {
        continue; // 直前に解放された
      }
      if (age > LOCK_STALE_MS) {
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`${key} への送信ロックを取得できませんでした`);
      await sleep(150);
    }
  }

  // 相手のターン待ちで長く持つことがあるので、生存を mtime で示し続ける
  const heartbeat = setInterval(() => {
    try {
      const now = new Date();
      fs.utimesSync(dir, now, now);
    } catch {
      /* 解放済み */
    }
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 相手が入力を受けられる状態（起動済みかつ working でない）になるまで待つ。
 * 旧 tmux 版が `❯` を待ってから send-keys していたのと同じ役割を、構造化状態で行う。
 * working 中に送ると入力が取りこぼされるため、ここを飛ばしてはいけない。
 */
async function waitReceptive(paneId, timeoutMs = RECEPTIVE_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const agent = await getAgent(paneId);
    if (agent?.interactive_ready && agent.agent_status !== "working") return agent.agent_status;
    await sleep(1000);
  }
  return null;
}

/**
 * 相手が空くのを少し待ってから送信する。
 * 空いた状態で送れた場合は working への遷移で着弾を確認できる（"accepted"）。
 * 空かないまま送った場合は Claude Code の入力キューに積まれる（"queued"）。
 *
 * 重要: "queued" が安全なのは、同一宛先への送信が withSendLock で直列化されている
 * 前提のとき。相手が working 中でも 3 本同時投入で 3/3 着弾したのはロック下での実測で、
 * ロックなしの同時送信は 6 本中 5 本が消える。この関数を単体で切り出して使わないこと。
 */
async function submitPrompt(paneId, text, acceptTimeoutMs = 20000) {
  const wasReceptive = (await waitReceptive(paneId)) !== null;

  await call("agent.prompt", { target: paneId, text });
  if (!wasReceptive) return "queued";

  const deadline = Date.now() + acceptTimeoutMs;
  while (Date.now() < deadline) {
    if ((await getAgent(paneId))?.agent_status === "working") return "accepted";
    await sleep(300);
  }
  return "unconfirmed";
}

/**
 * ペインのシェルが立ち上がるのを待って agent.start する。
 * layout.apply でペインを作った直後は "not an available shell" で弾かれることがある。
 * 窓は数十ミリ秒と狭く、meeting.sh -a のように setup 直後に launch すると踏む。
 */
async function startAgent(paneId, args, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await call("agent.start", {
        pane_id: paneId,
        kind: "claude",
        name: "claude",
        args,
        timeout_ms: START_TIMEOUT_MS,
      });
    } catch (e) {
      if (!/not an available shell/.test(e.message) || Date.now() > deadline) throw e;
      await sleep(500);
    }
  }
}

/** 既に起動していれば false、起動したら true。 */
export async function ensureRunning(member) {
  if (await getAgent(member.paneId)) {
    await waitInteractive(member.paneId);
    return false;
  }

  const args = ["--model", member.model];
  args.push(
    ...(process.env.USURAHI_DANGEROUS_SKIP_PERMISSIONS === "1"
      ? ["--dangerously-skip-permissions"]
      : ["--permission-mode", "acceptEdits"]),
  );

  await startAgent(member.paneId, args);
  await waitInteractive(member.paneId);
  if ((await submitPrompt(member.paneId, bootText(member))) === "unconfirmed") {
    console.error(`警告: ${member.label} のブート送信を確認できませんでした`);
  }

  const { sawWorking, status } = await settle(member.paneId);
  if (sawWorking && !status) {
    console.error(`警告: ${member.label} のブートが時間内に完了しませんでした`);
  } else if (status === "blocked") {
    console.error(`警告: ${member.label} が承認待ちで止まっています（部室で承認してください）`);
  }
  return true;
}

export async function launch(names) {
  const results = [];
  for (const name of names) {
    const member = await resolveMember(name);
    // notify と同じロックを取る。meeting.sh -w と同一宛先への初回 notify が
    // 重なると、両方が agent.start に入って二重起動になる。
    const started = await withSendLock(member.key, () => ensureRunning(member));
    results.push({ label: member.label, started });
  }
  return results;
}

export async function notify(name, message) {
  const member = await resolveMember(name);
  // 同一宛先への送信は必ず1本ずつ。並行させると入力バッファが上書きされて消える。
  return withSendLock(member.key, async () => {
    await ensureRunning(member);
    // 改行も特殊文字もそのまま渡る。send-keys 時代の1行化は不要。
    const accepted = await submitPrompt(member.paneId, message);
    if (accepted === "unconfirmed") {
      throw new Error(`${member.label} への送信を確認できませんでした（届いていない可能性があります）`);
    }
    return member;
  });
}

//--- CLI --------------------------------------------------------------------

const COMMANDS = {
  async setup() {
    const { panes } = await setup();
    for (const [label, paneId] of panes) console.log(`  ${paneId} → ${label}`);
  },

  async kill() {
    console.log((await kill()) ? "部室を閉じました" : "部室はもう開いていません");
  },

  async launch(...names) {
    if (!names.length) throw new Error("Usage: herdr.mjs launch <名前...>");
    for (const r of await launch(names)) {
      console.log(r.started ? `  ✓ ${r.label}` : `  - ${r.label}: 既に起動済み`);
    }
  },

  async notify(name, ...rest) {
    const message = rest.join(" ");
    if (!name || !message) throw new Error("Usage: herdr.mjs notify <名前> <本文>");
    const member = await notify(name, message);
    console.log(`${member.label} へ送りました`);
  },

  async focus() {
    const ws = await requireClubroom();
    await call("workspace.focus", { workspace_id: ws.workspace_id });
  },

  // 稼働チェック専用。herdr が居ない場合も「部室なし」として静かに 1 を返す
  // （autopilot.sh / library.sh が判定に使うため、標準エラーを汚さない）。
  async exists() {
    // protocol も見る。古い herdr で部室だけ在る状態を「稼働中」と誤判定すると、
    // 最初の agent.* 呼び出しまで失敗が遅れる。
    const compatible = await requirePrerequisites().then(
      () => true,
      () => false,
    );
    const ws = compatible ? await findClubroom().catch(() => null) : null;
    if (!ws) process.exit(1);
  },
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Usage: herdr.mjs <${Object.keys(COMMANDS).join("|")}> [args...]`);
    process.exit(1);
  }
  try {
    await handler(...args);
  } catch (e) {
    console.error(`エラー: ${e.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
