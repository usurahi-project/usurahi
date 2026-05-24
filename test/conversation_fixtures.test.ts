import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import yaml from "js-yaml";

type Finding = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

type LivenessModule = {
  validateMeetingLiveness: (
    meeting: unknown,
    options?: { now?: Date; staleAfterMinutes?: number },
  ) => { ok: boolean; findings: Finding[]; holder: string; waitingFor: string; nextAction: string };
};

type ConversationFixture = {
  name?: string;
  meeting: unknown;
  options?: {
    now?: string;
    stale_after_minutes?: number;
  };
  expect: {
    ok: boolean;
    holder?: string;
    waiting_for?: string;
    next_action?: string;
    finding_codes?: string[];
  };
};

async function loadLivenessModule(): Promise<LivenessModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "conversation-liveness.mjs")).href;
  return await import(moduleUrl) as LivenessModule;
}

async function loadFixtures(): Promise<Array<{ file: string; fixture: ConversationFixture }>> {
  const fixtureDir = path.join(process.cwd(), "fixtures", "conversations");
  const files = (await readdir(fixtureDir)).filter((file) => file.endsWith(".yaml")).sort();
  return await Promise.all(files.map(async (file) => {
    const body = await readFile(path.join(fixtureDir, file), "utf8");
    return { file, fixture: yaml.load(body) as ConversationFixture };
  }));
}

test("conversation fixtures match liveness expectations", async (t) => {
  const fixtures = await loadFixtures();
  const liveness = await loadLivenessModule();

  for (const { file, fixture } of fixtures) {
    await t.test(fixture.name || file, () => {
      const result = liveness.validateMeetingLiveness(fixture.meeting, {
        now: fixture.options?.now ? new Date(fixture.options.now) : undefined,
        staleAfterMinutes: fixture.options?.stale_after_minutes,
      });

      assert.equal(result.ok, fixture.expect.ok);

      if (fixture.expect.holder !== undefined) {
        assert.equal(result.holder, fixture.expect.holder);
      }

      if (fixture.expect.waiting_for !== undefined) {
        assert.equal(result.waitingFor, fixture.expect.waiting_for);
      }

      if (fixture.expect.next_action !== undefined) {
        assert.equal(result.nextAction, fixture.expect.next_action);
      }

      const actualCodes = result.findings.map((item) => item.code);
      assert.deepEqual(actualCodes.sort(), (fixture.expect.finding_codes || []).sort());
    });
  }
});
