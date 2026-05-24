import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

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

async function loadLivenessModule(): Promise<LivenessModule> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "conversation-liveness.mjs")).href;
  return await import(moduleUrl) as LivenessModule;
}

function healthyMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "meeting-1",
    phase: "discussing",
    status: "active",
    progress: {
      owner: "eru",
      waiting_for: "nagato",
      next_action: "check_feasibility",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: false,
        expectation_matched: false,
        ready_to_return: false,
      },
    },
    log: {
      updated_at: "2026-05-24T03:00:00.000Z",
    },
    ...overrides,
  };
}

test("conversation liveness accepts an active meeting with a clear member handoff", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting(), {
    now: new Date("2026-05-24T03:05:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.holder, "nagato");
  assert.equal(result.waitingFor, "nagato");
  assert.equal(result.nextAction, "check_feasibility");
  assert.deepEqual(result.findings, []);
});

test("conversation liveness fails when the ball cannot resolve to a member", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting({
    progress: {
      owner: "",
      waiting_for: "",
      next_action: "continue",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: true,
        expectation_matched: false,
        ready_to_return: false,
      },
    },
  }));

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((item) => item.code === "invalid_owner"));
  assert.ok(result.findings.some((item) => item.code === "missing_ball_holder"));
});

test("conversation liveness treats requester handoff as valid external waiting", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting({
    phase: "ready_to_return",
    progress: {
      owner: "eru",
      waiting_for: "requester",
      next_action: "ask_requester_to_confirm",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: true,
        expectation_matched: true,
        ready_to_return: true,
      },
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.holder, "eru");
  assert.equal(result.waitingFor, "requester");
});

test("conversation liveness accepts kyon preparing the response before requester handoff", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting({
    phase: "preparing_response",
    progress: {
      owner: "kyon",
      waiting_for: null,
      next_action: "prepare_response",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: true,
        expectation_matched: true,
        ready_to_return: false,
      },
    },
  }), { now: new Date("2026-05-24T03:05:00.000Z") });

  assert.equal(result.ok, true);
  assert.equal(result.holder, "kyon");
  assert.equal(result.waitingFor, "");
});

test("conversation liveness rejects ready_to_return before requester handoff", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting({
    phase: "ready_to_return",
    progress: {
      owner: "kyon",
      waiting_for: null,
      next_action: "prepare_response",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: true,
        expectation_matched: true,
        ready_to_return: true,
      },
    },
  }));

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((item) => item.code === "ready_to_return_not_external"));
});

test("conversation liveness catches missing next action and malformed completion checks", async () => {
  const liveness = await loadLivenessModule();
  const result = liveness.validateMeetingLiveness(healthyMeeting({
    progress: {
      owner: "kyon",
      waiting_for: null,
      next_action: "",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: "yes",
      },
    },
  }));

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((item) => item.code === "missing_next_action"));
  assert.ok(result.findings.some((item) => item.code === "invalid_completion_check"));
});

test("conversation liveness fails stale internal waits but allows stale requester waits", async () => {
  const liveness = await loadLivenessModule();
  const now = new Date("2026-05-24T12:00:00.000Z");

  const internal = liveness.validateMeetingLiveness(healthyMeeting({
    progress: {
      owner: "eru",
      waiting_for: "oreki",
      next_action: "extract_minimal_plan",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: false,
        expectation_matched: false,
        ready_to_return: false,
      },
    },
  }), { now, staleAfterMinutes: 60 });

  const external = liveness.validateMeetingLiveness(healthyMeeting({
    phase: "ready_to_return",
    progress: {
      owner: "eru",
      waiting_for: "requester_input",
      next_action: "wait_for_user_decision",
      completion_check: {
        scoped: true,
        direction_set: true,
        feasibility_checked: true,
        expectation_matched: true,
        ready_to_return: true,
      },
    },
  }), { now, staleAfterMinutes: 60 });

  assert.equal(internal.ok, false);
  assert.ok(internal.findings.some((item) => item.code === "stale_internal_wait"));
  assert.equal(external.ok, true);
});
