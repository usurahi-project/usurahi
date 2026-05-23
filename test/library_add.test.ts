import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import yaml from "js-yaml";

const root = process.cwd();
const script = path.join(root, "scripts", "library-add.ts");
const tsx = path.join(root, "node_modules", ".bin", "tsx");

type QueueData = {
  urls: Array<Record<string, unknown>>;
};

async function runScript(baseDir: string, args: string[]) {
  const child = spawn(tsx, [script, ...args], {
    cwd: root,
    env: { ...process.env, USURAHI_BASEDIR: baseDir, X_BEARER_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const [stdout, stderr, code] = await Promise.all([
    streamToString(child.stdout),
    streamToString(child.stderr),
    new Promise<number | null>((resolve) => child.on("close", resolve)),
  ]);

  return { stdout, stderr, code };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "usurahi-library-add-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function readQueue(baseDir: string): Promise<QueueData> {
  const body = await readFile(path.join(baseDir, "queue", "library_queue.yaml"), "utf8");
  return yaml.load(body) as QueueData;
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      body += chunk;
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(body));
  });
}

test("adds link to pending queue", async () => {
  await withTempDir(async (baseDir) => {
    const result = await runScript(baseDir, ["https://example.com/article", "--note", "memo", "--intent", "interesting"]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /図書室カウンターに追加/);
    const item = (await readQueue(baseDir)).urls[0];
    assert.equal(item.url, "https://example.com/article");
    assert.equal(item.note, "memo");
    assert.equal(item.intent, "interesting");
    assert.equal(item.source_type, "link");
    assert.equal(item.fetch_status, "not-needed");
  });
});

test("updates duplicate pending item", async () => {
  await withTempDir(async (baseDir) => {
    await runScript(baseDir, ["https://example.com/article"]);
    const result = await runScript(baseDir, ["https://example.com/article", "--note", "updated"]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /すでにカウンターにある/);
    const urls = (await readQueue(baseDir)).urls;
    assert.equal(urls.length, 1);
    assert.equal(urls[0].note, "updated");
  });
});

test("rejects unknown intent", async () => {
  await withTempDir(async (baseDir) => {
    const result = await runScript(baseDir, ["https://example.com/article", "--intent", "now"]);

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /intent must be one of/);
  });
});

test("adds X URL with manual excerpt without network", async () => {
  await withTempDir(async (baseDir) => {
    const result = await runScript(baseDir, ["https://x.com/user/status/12345", "--excerpt", "quoted text"]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /X入力: manual/);
    const item = (await readQueue(baseDir)).urls[0];
    assert.equal(item.source_type, "x");
    assert.equal(item.post_id, "12345");
    assert.equal(item.author_hint, "user");
    assert.equal(item.fetch_status, "manual");
  });
});
