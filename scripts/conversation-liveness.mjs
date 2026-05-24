#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { currentBallHolder, normalizeMember } from "./meeting-highlight.mjs";

const BASEDIR = process.env.USURAHI_BASEDIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GIJIROKU_FILE = path.join(BASEDIR, "queue", "gijiroku.yaml");

const MEMBER_IDS = new Set(["eru", "haruhi", "oreki", "kyon", "nagato"]);
const EXTERNAL_WAITERS = new Set(["requester", "requester_input"]);
const REQUIRED_COMPLETION_KEYS = [
  "scoped",
  "direction_set",
  "feasibility_checked",
  "expectation_matched",
  "ready_to_return",
];
const KNOWN_PHASES = new Set(["clarifying", "shared", "discussing", "waiting", "ready_to_return", "done"]);

function text(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finding(code, message, severity = "error") {
  return { code, message, severity };
}

function normalizeWaitingFor(value) {
  const normalized = text(value);
  if (MEMBER_IDS.has(normalized) || EXTERNAL_WAITERS.has(normalized)) return normalized;
  return "";
}

function isExternalWait(value) {
  return EXTERNAL_WAITERS.has(text(value));
}

function minutesSince(isoString, now = new Date()) {
  const parsed = Date.parse(text(isoString));
  if (Number.isNaN(parsed)) return null;
  return Math.round((now.getTime() - parsed) / 60_000);
}

export function validateMeetingLiveness(meeting, options = {}) {
  const staleAfterMinutes = options.staleAfterMinutes ?? 360;
  const now = options.now || new Date();
  const findings = [];

  if (!meeting) {
    return { ok: true, findings, holder: "", waitingFor: "", nextAction: "" };
  }

  if (!isPlainObject(meeting)) {
    findings.push(finding("meeting_not_object", "meeting must be an object"));
    return { ok: false, findings, holder: "", waitingFor: "", nextAction: "" };
  }

  const phase = text(meeting.phase);
  const progress = meeting.progress;
  const owner = text(progress?.owner);
  const waitingFor = text(progress?.waiting_for);
  const normalizedWaitingFor = normalizeWaitingFor(progress?.waiting_for);
  const nextAction = text(progress?.next_action);
  const holder = currentBallHolder(meeting);
  const completion = progress?.completion_check;

  if (!text(meeting.id)) {
    findings.push(finding("missing_id", "active meeting must have an id"));
  }

  if (!phase) {
    findings.push(finding("missing_phase", "active meeting must have a phase"));
  } else if (!KNOWN_PHASES.has(phase)) {
    findings.push(finding("unknown_phase", `unknown meeting phase: ${phase}`, "warning"));
  }

  if (!isPlainObject(progress)) {
    findings.push(finding("missing_progress", "active meeting must have progress"));
  }

  if (!normalizeMember(owner)) {
    findings.push(finding("invalid_owner", "progress.owner must be one of eru, haruhi, oreki, kyon, nagato"));
  }

  if (waitingFor && !normalizedWaitingFor) {
    findings.push(finding("invalid_waiting_for", "progress.waiting_for must be a member, requester, requester_input, or empty"));
  }

  if (!nextAction) {
    findings.push(finding("missing_next_action", "progress.next_action must explain the next move"));
  }

  if (!holder) {
    findings.push(finding("missing_ball_holder", "active meeting must resolve to a member ball holder"));
  }

  if (phase === "ready_to_return" && !isExternalWait(waitingFor)) {
    findings.push(finding("ready_to_return_not_external", "ready_to_return must hand the ball back to requester/requester_input"));
  }

  if (phase === "done" && waitingFor && !isExternalWait(waitingFor)) {
    findings.push(finding("done_waiting_on_member", "done meeting must not wait on a member"));
  }

  if (!isPlainObject(completion)) {
    findings.push(finding("missing_completion_check", "progress.completion_check must exist"));
  } else {
    for (const key of REQUIRED_COMPLETION_KEYS) {
      if (typeof completion[key] !== "boolean") {
        findings.push(finding("invalid_completion_check", `completion_check.${key} must be boolean`));
      }
    }
  }

  const updatedAt = text(meeting.log?.updated_at);
  const ageMinutes = minutesSince(updatedAt, now);
  if (!updatedAt) {
    findings.push(finding("missing_updated_at", "meeting.log.updated_at should be recorded", "warning"));
  } else if (ageMinutes === null) {
    findings.push(finding("invalid_updated_at", "meeting.log.updated_at must be parseable", "warning"));
  } else if (ageMinutes > staleAfterMinutes && !isExternalWait(waitingFor) && phase !== "done") {
    findings.push(finding("stale_internal_wait", `internal wait has been stale for ${ageMinutes} minutes`));
  }

  return {
    ok: findings.every((item) => item.severity !== "error"),
    findings,
    holder,
    waitingFor: normalizedWaitingFor,
    nextAction,
  };
}

export function readMeetingFromGijiroku(filePath = GIJIROKU_FILE) {
  if (!fs.existsSync(filePath)) return null;
  const data = yaml.load(fs.readFileSync(filePath, "utf8")) || {};
  return data.meeting || null;
}

function main() {
  const result = validateMeetingLiveness(readMeetingFromGijiroku());
  for (const item of result.findings) {
    console.log(`${item.severity}\t${item.code}\t${item.message}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
