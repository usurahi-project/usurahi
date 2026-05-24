#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_OBSIDIAN_USURAHI_DIR = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI_DIR = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI_DIR;
const DASHBOARD_PUBLIC_DIR = path.join(BASEDIR, "dashboard", "public");
const STATUS_OUTPUT_FILE = path.join(DASHBOARD_PUBLIC_DIR, "school-status.json");
const PID_FILE = path.join(BASEDIR, "queue", ".autopilot.pid");
const AUTOPILOT_LOG = "/tmp/usurahi-autopilot.log";
const LIBRARY_QUEUE_FILE = path.join(BASEDIR, "queue", "library_queue.yaml");
const LIBRARY_HISTORY_FILE = path.join(BASEDIR, "queue", "library_history.yaml");
const NOTICEBOARD_FILE = path.join(BASEDIR, "queue", "noticeboard.yaml");
const NEWS_STATE_FILE = path.join(BASEDIR, "queue", "news_watch_state.yaml");
const SCHOOL_CYCLE_FILE = path.join(BASEDIR, "queue", "school_cycle_state.yaml");
const MEETING_FILE = path.join(BASEDIR, "queue", "gijiroku.yaml");
const MAINTENANCE_LOG = path.join(OBSIDIAN_USURAHI_DIR, "図書館", "摩耶花の整頓記録.md");
const VAULT_DASHBOARD_DIR = path.join(OBSIDIAN_USURAHI_DIR, "職員室", "dashboard");
const DASHBOARD_HTML_FILE = path.join(VAULT_DASHBOARD_DIR, "index.html");
const VAULT_STATUS_OUTPUT_FILE = path.join(VAULT_DASHBOARD_DIR, "school-status.json");

function readYaml(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, "utf8")) || fallback;
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n");
}

function now() {
  return new Date().toISOString();
}

function ageMinutes(isoString) {
  if (!isoString) return null;
  const value = Date.parse(isoString);
  if (Number.isNaN(value)) return null;
  return Math.round((Date.now() - value) / (1000 * 60));
}

function autopilotStatus() {
  const pid = fs.existsSync(PID_FILE) ? String(fs.readFileSync(PID_FILE, "utf8")).trim() : "";
  let running = false;

  if (pid) {
    try {
      process.kill(Number(pid), 0);
      running = true;
    } catch {
      running = false;
    }
  }

  const logLines = fs.existsSync(AUTOPILOT_LOG) ? readLines(AUTOPILOT_LOG).filter(Boolean) : [];
  return {
    running,
    pid: pid || null,
    log_path: AUTOPILOT_LOG,
    last_log_line: logLines.at(-1) || "",
  };
}

function libraryStatus() {
  const queue = readYaml(LIBRARY_QUEUE_FILE, { urls: [] });
  const history = readYaml(LIBRARY_HISTORY_FILE, { entries: [] });
  const pending = Array.isArray(queue.urls) ? queue.urls : [];
  const entries = Array.isArray(history.entries) ? history.entries : [];
  const failed = entries.filter((entry) => entry.status === "failed");
  const done = entries.filter((entry) => entry.status === "done");
  const latestFailed = failed[0] || null;
  const maintenanceLines = readLines(MAINTENANCE_LOG).filter((line) => line.startsWith("- "));

  return {
    pending_count: pending.length,
    done_history_count: done.length,
    failed_history_count: failed.length,
    latest_failed: latestFailed
      ? {
          url: latestFailed.url || "",
          stage: latestFailed.stage || "",
          message: latestFailed.error?.message || "",
          recorded_at: latestFailed.history_recorded_at || latestFailed.processed_at || "",
        }
      : null,
    last_maintenance: maintenanceLines.at(-1) || "",
  };
}

function noticeboardStatus() {
  const board = readYaml(NOTICEBOARD_FILE, { posts: [] });
  const posts = Array.isArray(board.posts) ? board.posts : [];
  const open = posts.filter((post) => post.status !== "done");
  return {
    total_posts: posts.length,
    open_posts: open.length,
    latest_open_posts: open.slice(0, 5).map((post) => ({
      id: post.id || "",
      kind: post.kind || "",
      body: post.body || "",
      created_at: post.created_at || "",
    })),
  };
}

function schoolWatchStatus() {
  const state = readYaml(NEWS_STATE_FILE, {});
  const sourceErrors = Object.entries(state.source_errors || {})
    .filter(([, error]) => error)
    .map(([source, error]) => ({
      source,
      at: error.at || "",
      message: String(error.message || "").trim(),
    }));

  return {
    last_checked_at: state.last_checked_at || "",
    age_minutes: ageMinutes(state.last_checked_at),
    source_errors: sourceErrors,
  };
}

function schoolCycleStatus() {
  const state = readYaml(SCHOOL_CYCLE_FILE, { tasks: {} });
  const tasks = Object.entries(state.tasks || {}).map(([id, value]) => ({
    id,
    last_run_at: value?.last_run_at || "",
    age_minutes: ageMinutes(value?.last_run_at),
    last_error_at: value?.last_error_at || "",
    last_error: value?.last_error || "",
  }));

  return { tasks };
}

function memberLabel(id) {
  const labels = {
    eru: "える",
    haruhi: "ハルヒ",
    oreki: "折木",
    kyon: "キョン",
    nagato: "長門",
    requester: "依頼者",
    requester_input: "依頼者",
  };
  return labels[id] || id || "";
}

function phaseLabel(phase) {
  const labels = {
    clarifying: "確認中",
    shared: "共有済み",
    discussing: "議論中",
    waiting: "返答待ち",
    preparing_response: "返答準備",
    ready_to_return: "依頼者確認",
    done: "完了",
  };
  return labels[phase] || phase || "未開始";
}

function normalizeMember(value) {
  const member = String(value || "").trim();
  return ["eru", "haruhi", "oreki", "kyon", "nagato"].includes(member) ? member : "";
}

function meetingStatus() {
  const data = readYaml(MEETING_FILE, { meeting: null });
  const meeting = data.meeting || null;
  const progress = meeting?.progress || {};
  const waitingMember = normalizeMember(progress.waiting_for);
  const ownerMember = normalizeMember(progress.owner);
  const ballHolder = waitingMember || ownerMember || "";
  const completion = progress.completion_check || {};
  const checks = [
    ["scoped", "範囲"],
    ["direction_set", "方向"],
    ["feasibility_checked", "可否"],
    ["expectation_matched", "期待値"],
    ["ready_to_return", "提出準備"],
  ].map(([id, label]) => ({
    id,
    label,
    done: Boolean(completion[id]),
  }));

  return {
    active: Boolean(meeting),
    id: meeting?.id || "",
    phase: meeting?.phase || "",
    phase_label: phaseLabel(meeting?.phase),
    owner: progress.owner || "",
    owner_label: memberLabel(progress.owner),
    waiting_for: progress.waiting_for || "",
    waiting_for_label: memberLabel(progress.waiting_for),
    ball_holder: ballHolder,
    ball_holder_label: memberLabel(ballHolder) || "なし",
    next_action: progress.next_action || "",
    request: meeting?.blackboard?.request || meeting?.why?.request || "",
    conclusion: meeting?.blackboard?.conclusion || meeting?.what?.conclusion || "",
    updated_at: meeting?.log?.updated_at || "",
    completion_checks: checks,
  };
}

function linksStatus() {
  return {
    vault_dashboard_html: path.relative(OBSIDIAN_USURAHI_DIR, DASHBOARD_HTML_FILE),
    vault_dashboard_dir: path.relative(OBSIDIAN_USURAHI_DIR, VAULT_DASHBOARD_DIR),
  };
}

function buildStatus() {
  return {
    generated_at: now(),
    school_name: "薄氷",
    autopilot: autopilotStatus(),
    library: libraryStatus(),
    noticeboard: noticeboardStatus(),
    meeting: meetingStatus(),
    school_watch: schoolWatchStatus(),
    school_cycle: schoolCycleStatus(),
    links: linksStatus(),
  };
}

function main() {
  const status = buildStatus();
  fs.mkdirSync(DASHBOARD_PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(VAULT_DASHBOARD_DIR, { recursive: true });
  const payload = JSON.stringify(status, null, 2);
  fs.writeFileSync(STATUS_OUTPUT_FILE, payload, "utf8");
  fs.writeFileSync(VAULT_STATUS_OUTPUT_FILE, payload, "utf8");
  console.log(`school-status: wrote ${STATUS_OUTPUT_FILE}`);
  console.log(`school-status: wrote ${VAULT_STATUS_OUTPUT_FILE}`);
}

main();
