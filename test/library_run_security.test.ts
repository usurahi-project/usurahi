import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import yaml from "js-yaml";

const root = process.cwd();
const script = path.join(root, "scripts", "library-run.mjs");

type QueueData = {
  urls: Array<{
    url: string;
    status: string;
    stage?: string;
    error?: { message?: string };
  }>;
};

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
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

async function runLibrary(baseDir: string, vaultDir: string) {
  const child = spawn("node", [script], {
    cwd: root,
    env: {
      ...process.env,
      USURAHI_BASEDIR: baseDir,
      OBSIDIAN_USURAHI_DIR: vaultDir,
      SLACK_BOT_TOKEN: "",
      X_BEARER_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const [stdout, stderr, code] = await Promise.all([
    streamToString(child.stdout),
    streamToString(child.stderr),
    new Promise<number | null>((resolve) => child.on("close", resolve)),
  ]);

  return { stdout, stderr, code };
}

test("library runner rejects non-https queued URLs before fetching content", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "usurahi-library-run-"));
  const vaultDir = await mkdtemp(path.join(tmpdir(), "usurahi-vault-"));

  try {
    await mkdir(path.join(baseDir, "queue"), { recursive: true });
    await writeFile(
      path.join(baseDir, "queue", "library_queue.yaml"),
      yaml.dump({
        urls: [
          {
            url: "file:///etc/passwd",
            note: "",
            intent: "",
            excerpt: "",
            status: "pending",
            stage: "queued",
            fetched_text: "",
            normalized_text: "",
            draft: { title: "", summary: "", tags: [], comment: "" },
            error: null,
            source_type: "link",
            fetch_status: "not-needed",
          },
        ],
      }),
      "utf8",
    );

    const result = await runLibrary(baseDir, vaultDir);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /https URL だけ許可/);
    const history = yaml.load(await readFile(path.join(baseDir, "queue", "library_history.yaml"), "utf8")) as QueueData;
    assert.equal(history.urls, undefined);
    assert.equal((history as unknown as { entries: QueueData["urls"] }).entries[0].status, "failed");
  } finally {
    await rm(baseDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  }
});
