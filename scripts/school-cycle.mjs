#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STATE_FILE = path.join(BASEDIR, "queue", "school_cycle_state.yaml");

const TASKS = [
  { id: "board_scout", everyMinutes: 30, script: "board-scout.mjs", args: ["--apply"] },
  { id: "news_watch", everyMinutes: 360, script: "school-watch.mjs", args: ["--apply", "--allow-network"], requiresNetwork: true },
  { id: "library_maintain", everyMinutes: 180, script: "library-maintain.mjs", args: [] },
];

function now() {
  return new Date().toISOString();
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { tasks: {} };
  return yaml.load(fs.readFileSync(STATE_FILE, "utf8")) || { tasks: {} };
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, yaml.dump(state, { lineWidth: -1, noRefs: true }), "utf8");
}

function isStale(lastRunAt, everyMinutes) {
  if (!lastRunAt) return true;
  const parsed = Date.parse(lastRunAt);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed >= everyMinutes * 60 * 1000;
}

async function runTask(task, state, force) {
  const taskState = state.tasks[task.id] || {};
  if (!force && !isStale(taskState.last_run_at, task.everyMinutes)) {
    console.log(`school-cycle: skip ${task.id}`);
    return;
  }

  if (task.requiresNetwork && process.env.USURAHI_ENABLE_SCHOOL_NETWORK !== "1") {
    console.log(`school-cycle: skip ${task.id} (network disabled)`);
    return;
  }

  const scriptPath = path.join(BASEDIR, "scripts", task.script);
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...task.args], { cwd: BASEDIR });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());

  state.tasks[task.id] = {
    last_run_at: now(),
    last_error_at: null,
    last_error: null,
  };
}

async function main() {
  const force = process.argv.includes("--force");
  const statusOnly = process.argv.includes("--status");
  const state = loadState();

  if (statusOnly) {
    console.log(yaml.dump(state, { lineWidth: -1, noRefs: true }).trim());
    return;
  }

  for (const task of TASKS) {
    try {
      await runTask(task, state, force);
    } catch (error) {
      console.error(`school-cycle: ${task.id} failed: ${error.message}`);
      state.tasks[task.id] = {
        ...(state.tasks[task.id] || {}),
        last_error_at: now(),
        last_error: error.message,
      };
    }
  }

  saveState(state);
}

main().catch((error) => {
  console.error(`school-cycle failed: ${error.message}`);
  process.exit(1);
});
