#!/usr/bin/env node
/**
 * 薄氷（うすらひ）キュー操作MCPサーバー
 * エージェントがYAMLファイルを直接読み書きする代わりに、
 * このMCPサーバーのツールを使うことでトークン消費を削減する。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { loadPendingQueue, savePendingQueue, loadLibraryHistory, recordLibraryHistory } from "../scripts/library-queue-store.mjs";

const BASEDIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUEUE = path.join(BASEDIR, "queue");
const DEFAULT_OBSIDIAN_USURAHI = path.join(process.env.HOME || "", "Documents", "Obsidian Vault", "薄氷");
const OBSIDIAN_USURAHI = process.env.OBSIDIAN_USURAHI_DIR || DEFAULT_OBSIDIAN_USURAHI;
const OBSIDIAN_FOLDERS = { archive: "図書館/薄氷バックナンバー", activity_log: "部室/活動記録", library: "図書館/開架" };

// ── helpers ──

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content) || null;
}

function writeYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true }), "utf8");
}

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

function currentDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function slugify(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeNoteTitle(title) {
  const safeTitle = String(title || "untitled")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\.\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return safeTitle || "untitled";
}

function formatBoardValue(value, { empty = "---", fallback = "なし" } = {}) {
  if (value === null || value === undefined) return empty;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : empty;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return empty;
    return value
      .map((item) => {
        if (typeof item === "string") return `- ${item}`;
        if (item && typeof item === "object") {
          if (item.task && item.assignee) return `- ${item.task} (${item.assignee})`;
          if (item.title && item.owner) return `- ${item.title} (${item.owner})`;
          return `- ${yaml.dump(item, { lineWidth: -1 }).trim()}`;
        }
        return `- ${String(item)}`;
      })
      .join("\n");
  }
  if (typeof value === "object") {
    const dumped = yaml.dump(value, { lineWidth: -1 }).trim();
    return dumped.length > 0 ? dumped : fallback;
  }
  return String(value);
}

function formatProgressLabel(value) {
  const labels = {
    eru: "える",
    haruhi: "ハルヒ",
    oreki: "折木",
    kyon: "キョン",
    nagato: "長門",
    requester: "依頼者",
    requester_input: "依頼者",
  };
  const normalized = String(value || "").trim();
  return labels[normalized] || normalized || "---";
}

function formatPhaseLabel(value) {
  const labels = {
    clarifying: "確認中",
    shared: "共有済み",
    discussing: "議論中",
    waiting: "返答待ち",
    ready_to_return: "提出準備",
    done: "完了",
  };
  const normalized = String(value || "").trim();
  return labels[normalized] || normalized || "---";
}

function renderCompletionCheck(check = {}) {
  const rows = [
    ["scoped", "範囲"],
    ["direction_set", "方向"],
    ["feasibility_checked", "可否"],
    ["expectation_matched", "期待値"],
    ["ready_to_return", "提出準備"],
  ];
  return rows.map(([key, label]) => `${check[key] ? "✓" : "□"} ${label}`).join(" / ");
}

function renderBlackboard(meeting) {
  if (!meeting) {
    return `# 黒板
最終更新: ---

## 📌 依頼
なし

## 🧭 背景
---

## 🧩 論点
---

## ⚠️ 懸念
---

## 👥 タスク
---

## ✅ 決まったこと
---

## ⏸ 保留
---

## ✔ 完了
---

## 📝 今の部としての結論
---

## 🚪 提出
未提出

## 💡 メモ
なし
`;
  }

  const board = meeting.blackboard || {};
  const request = board.request || meeting.why?.request || "なし";
  const background = board.background ?? meeting.why?.background;
  const topics = board.topics ?? meeting.how?.topics;
  const concerns = board.concerns ?? meeting.how?.concerns;
  const tasks = board.tasks ?? meeting.how?.assignments ?? meeting.how?.task_breakdown;
  const decisions = board.decisions ?? meeting.how?.decisions;
  const pending = board.pending ?? meeting.how?.pending;
  const done = board.done ?? meeting.how?.done;
  const conclusion = board.conclusion ?? meeting.what?.conclusion;
  const posted = meeting.what?.submission?.posted;
  const memo = board.memo;
  const updatedAt = meeting.log?.updated_at || "---";
  const progress = meeting.progress || {};
  const statusLines = [
    `- フェーズ: ${formatPhaseLabel(meeting.phase)}`,
    `- ボール: ${formatProgressLabel(progress.waiting_for || progress.owner)}`,
    `- 進行役: ${formatProgressLabel(progress.owner)}`,
    `- 次の一手: ${formatBoardValue(progress.next_action, { empty: "---" })}`,
    `- 完了条件: ${renderCompletionCheck(progress.completion_check)}`,
  ].join("\n");

  return `# 黒板
最終更新: ${updatedAt}

## 🟨 会議ステータス
${statusLines}

## 📌 依頼
${formatBoardValue(request, { empty: "なし" })}

## 🧭 背景
${formatBoardValue(background)}

## 🧩 論点
${formatBoardValue(topics)}

## ⚠️ 懸念
${formatBoardValue(concerns)}

## 👥 タスク
${formatBoardValue(tasks)}

## ✅ 決まったこと
${formatBoardValue(decisions)}

## ⏸ 保留
${formatBoardValue(pending)}

## ✔ 完了
${formatBoardValue(done)}

## 📝 今の部としての結論
${formatBoardValue(conclusion)}

## 🚪 提出
${posted ? formatBoardValue(posted) : "未提出"}

## 💡 メモ
${formatBoardValue(memo, { empty: "なし" })}
`;
}

function syncBlackboardFromMeeting(meeting) {
  const filePath = path.join(BASEDIR, "blackboard.md");
  fs.writeFileSync(filePath, renderBlackboard(meeting), "utf8");
}

function resetMeetingState() {
  writeYaml(path.join(QUEUE, "gijiroku.yaml"), { meeting: null });
  syncBlackboardFromMeeting(null);
}

function ensureMeetingProgressDefaults(meeting) {
  if (!meeting || typeof meeting !== "object") return meeting;

  if (!meeting.progress || typeof meeting.progress !== "object") {
    meeting.progress = {};
  }

  if (meeting.progress.owner === undefined) meeting.progress.owner = "eru";
  if (meeting.progress.waiting_for === undefined) meeting.progress.waiting_for = "requester_input";
  if (meeting.progress.next_action === undefined) meeting.progress.next_action = "ask_request_input";

  if (!meeting.progress.completion_check || typeof meeting.progress.completion_check !== "object") {
    meeting.progress.completion_check = {};
  }

  if (meeting.progress.completion_check.scoped === undefined) {
    meeting.progress.completion_check.scoped = false;
  }
  if (meeting.progress.completion_check.direction_set === undefined) {
    meeting.progress.completion_check.direction_set = false;
  }
  if (meeting.progress.completion_check.feasibility_checked === undefined) {
    meeting.progress.completion_check.feasibility_checked = false;
  }
  if (meeting.progress.completion_check.expectation_matched === undefined) {
    meeting.progress.completion_check.expectation_matched = false;
  }
  if (meeting.progress.completion_check.ready_to_return === undefined) {
    meeting.progress.completion_check.ready_to_return = false;
  }

  return meeting;
}

function writeObsidianNote({ category, title, content, tags = [], related = [] }) {
  const folderName = OBSIDIAN_FOLDERS[category] || category;
  const dir = path.join(OBSIDIAN_USURAHI, folderName);
  fs.mkdirSync(dir, { recursive: true });
  const safeTitle = sanitizeNoteTitle(title);

  const today = currentDate();
  const allTags = ["薄氷", category, ...tags];
  const tagLine = allTags.map((t) => `  - ${t}`).join("\n");

  let finalContent = content;
  if (related.length > 0) {
    const links = related.map((r) => `- [[${r}]]`).join("\n");
    finalContent += `\n\n## 関連\n${links}\n`;
  }

  const frontmatter = `---\ndate: ${today}\ncategory: ${category}\ntags:\n${tagLine}\n---\n\n`;
  const filePath = path.join(dir, `${safeTitle}.md`);
  fs.writeFileSync(filePath, frontmatter + finalContent, "utf8");
  return filePath;
}

function getReportsForMeeting(meetingId) {
  const workers = ["oreki", "kyon", "nagato"];
  return workers
    .map((worker) => readYaml(path.join(QUEUE, "reports", `${worker}_report.yaml`)))
    .filter((report) => report && report.meeting_id === meetingId);
}

function renderActivityLog(meeting, reports = []) {
  const date = currentDate();
  const requestTitle = meeting.why?.request || "無題の依頼";
  const background = formatBoardValue(meeting.why?.background, { empty: "なし" });
  const topics = formatBoardValue(meeting.how?.topics, { empty: "なし" });
  const concerns = formatBoardValue(meeting.how?.concerns, { empty: "なし" });
  const approach = formatBoardValue(meeting.how?.approach, { empty: "なし" });
  const tasks = formatBoardValue(meeting.blackboard?.tasks || meeting.how?.assignments || meeting.how?.task_breakdown, { empty: "なし" });
  const decisions = formatBoardValue(meeting.how?.decisions, { empty: "なし" });
  const pending = formatBoardValue(meeting.how?.pending, { empty: "なし" });
  const done = formatBoardValue(meeting.how?.done, { empty: "なし" });
  const conclusion = formatBoardValue(meeting.what?.conclusion, { empty: "なし" });
  const rationale = formatBoardValue(meeting.what?.rationale, { empty: "なし" });
  const submission = formatBoardValue(meeting.what?.submission?.posted, { empty: "未提出" });

  const reportSection = reports.length === 0
    ? "なし"
    : reports
        .map((report) => {
          const summary = report.result?.summary || "要約なし";
          const files = report.result?.files_modified?.length
            ? report.result.files_modified.map((file) => `  - ${file}`).join("\n")
            : "  - なし";
          const notes = report.result?.notes ? report.result.notes : "なし";
          return [
            `### ${report.worker}`,
            `- 状態: ${report.status}`,
            `- 要約: ${summary}`,
            "- 変更ファイル:",
            files,
            `- 備考: ${notes}`,
          ].join("\n");
        })
        .join("\n\n");

  return `# 活動記録 — ${date}

## 部会 ${meeting.id}: ${requestTitle}

### 依頼
${requestTitle}

### 背景
${background}

### 論点
${topics}

### 懸念
${concerns}

### 進め方
${approach}

### タスク
${tasks}

### 決まったこと
${decisions}

### 保留
${pending}

### 完了
${done}

### 結論
${conclusion}

### 結論の理由
${rationale}

### 提出
${submission}

### 作業報告
${reportSection}
`;
}

function archiveMeetingLog(meeting) {
  if (!meeting?.id) return null;
  const date = currentDate();
  const titleBase = `${date}_${meeting.id}_${slugify(meeting.why?.request || "活動記録")}`;
  const title = titleBase.slice(0, 120);
  const reports = getReportsForMeeting(meeting.id);
  const content = renderActivityLog(meeting, reports);

  const localDir = path.join(BASEDIR, "activity-log");
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, `${title}.md`);
  fs.writeFileSync(localPath, content, "utf8");

  const tags = [
    "活動記録",
    meeting.phase || "conclusion",
    ...(meeting.project_path ? [path.basename(meeting.project_path)] : []),
  ];
  writeObsidianNote({
    category: "activity_log",
    title,
    content,
    tags,
    related: [],
  });

  return { title, localPath };
}

function nextArchiveNumber() {
  const dir = path.join(BASEDIR, "archive");
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter((file) => /^vol\d+_.*\.md$/i.test(file));
  const max = files.reduce((acc, file) => {
    const match = file.match(/^vol(\d+)_/i);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return max + 1;
}

function readActivityLogByTitle(title) {
  const safeTitle = sanitizeNoteTitle(title);
  const localPath = path.join(BASEDIR, "activity-log", `${safeTitle}.md`);
  if (fs.existsSync(localPath)) {
    return {
      title: safeTitle,
      content: fs.readFileSync(localPath, "utf8"),
      localPath,
    };
  }

  const obsidianPath = path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.activity_log, `${safeTitle}.md`);
  if (fs.existsSync(obsidianPath)) {
    return {
      title: safeTitle,
      content: fs.readFileSync(obsidianPath, "utf8"),
      localPath: obsidianPath,
    };
  }

  return null;
}

function renderArchiveEntry({
  volume,
  title,
  use_cases,
  method,
  cautions,
  fun_reason,
  source_title,
  source_excerpt,
}) {
  const useCasesText = formatBoardValue(use_cases, { empty: "なし" });
  const methodText = formatBoardValue(method, { empty: "なし" });
  const cautionsText = formatBoardValue(cautions, { empty: "なし" });

  return `# Vol.${String(volume).padStart(2, "0")} ${title}

## どういう時に使うか
${useCasesText}

## やり方
${methodText}

## 気をつけること
${cautionsText}

## 面白かった理由
${fun_reason}

## 元になった活動記録
- [[${source_title}]]

## 抜粋
${source_excerpt}
`;
}

function archiveEntry({
  title,
  use_cases,
  method,
  cautions,
  fun_reason,
  source_title,
}) {
  const activityLog = readActivityLogByTitle(source_title);
  if (!activityLog) {
    return { error: `活動記録が見つからない: ${source_title}` };
  }

  const volume = nextArchiveNumber();
  const safeSlug = slugify(title).replace(/\s+/g, "_");
  const filename = `vol${String(volume).padStart(2, "0")}_${safeSlug}.md`;
  const source_excerpt = activityLog.content.split("\n").slice(0, 12).join("\n");
  const content = renderArchiveEntry({
    volume,
    title,
    use_cases,
    method,
    cautions,
    fun_reason,
    source_title,
    source_excerpt,
  });

  const localDir = path.join(BASEDIR, "archive");
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, filename);
  fs.writeFileSync(localPath, content, "utf8");

  writeObsidianNote({
    category: "archive",
    title: filename.replace(/\.md$/, ""),
    content,
    tags: ["バックナンバー", "再利用パターン"],
    related: [source_title],
  });

  return {
    volume,
    filename,
    localPath,
  };
}

function createMeetingState({ meeting_id, project_path, request }) {
  const now = timestamp();
  return {
    meeting: {
      id: meeting_id,
      project_path,
      phase: "clarifying",
      status: "active",
      why: {
        request,
        background: null,
        motivation: null,
        requester_intent: null,
        success_signal: null,
      },
      how: {
        topics: [],
        concerns: [],
        options: [],
        approach: null,
        task_breakdown: [],
        assignments: [],
        feasibility: {
          requested_by: null,
          answer: null,
          conditions: [],
        },
        decisions: [],
        pending: [],
        done: [],
      },
      what: {
        conclusion: null,
        rationale: [],
        deliverables: [],
        submission: {
          draft: null,
          posted: null,
        },
      },
      revision: {
        requested: false,
        note: null,
        requested_changes: [],
        minimal_fix: null,
        reality_check: null,
        feasibility: null,
      },
      blackboard: {
        request,
        background: null,
        topics: [],
        concerns: [],
        tasks: [],
        decisions: [],
        pending: [],
        done: [],
        conclusion: null,
      },
      progress: {
        owner: "eru",
        waiting_for: "requester",
        next_action: "ask_requester",
        completion_check: {
          scoped: false,
          direction_set: false,
          feasibility_checked: false,
          expectation_matched: false,
          ready_to_return: false,
        },
      },
      log: {
        created_at: now,
        updated_at: now,
      },
    },
  };
}

function syncRoomRequestStatus({ request_id, status }) {
  if (!request_id) return;
  const filePath = path.join(QUEUE, "room_requests.yaml");
  const data = readYaml(filePath);
  if (!data?.requests) return;
  const request = data.requests.find((item) => item.id === request_id);
  if (!request) return;
  request.status = status;
  if (status === "in_progress") request.started_at = timestamp();
  if (status === "done") request.responded_at = timestamp();
  writeYaml(filePath, data);
}

function syncDerivedBlackboardFields(meeting, field) {
  if (!meeting.blackboard) meeting.blackboard = {};

  if (field === "why.request") meeting.blackboard.request = meeting.why?.request || null;
  if (field === "why.background") meeting.blackboard.background = meeting.why?.background || null;
  if (field === "how.topics") meeting.blackboard.topics = meeting.how?.topics || [];
  if (field === "how.concerns") meeting.blackboard.concerns = meeting.how?.concerns || [];
  if (field === "how.decisions") meeting.blackboard.decisions = meeting.how?.decisions || [];
  if (field === "how.pending") meeting.blackboard.pending = meeting.how?.pending || [];
  if (field === "how.done") meeting.blackboard.done = meeting.how?.done || [];
  if (field === "how.task_breakdown" || field === "how.assignments") {
    meeting.blackboard.tasks = meeting.how?.assignments?.length ? meeting.how.assignments : (meeting.how?.task_breakdown || []);
  }
  if (field === "what.conclusion") meeting.blackboard.conclusion = meeting.what?.conclusion || null;
}

function syncMeetingSubmissionFromRoomRequest({ request_id, response }) {
  const filePath = path.join(QUEUE, "gijiroku.yaml");
  const data = readYaml(filePath);
  if (!data?.meeting) return;
  if (data.meeting.request_id !== request_id) return;

  ensureMeetingProgressDefaults(data.meeting);
  if (!data.meeting.what) data.meeting.what = {};
  if (!data.meeting.what.submission) data.meeting.what.submission = {};
  if (!data.meeting.log) data.meeting.log = { created_at: timestamp(), updated_at: timestamp() };

  data.meeting.what.submission.posted = response;
  data.meeting.phase = "done";
  data.meeting.status = "closed";
  data.meeting.progress.waiting_for = null;
  data.meeting.progress.next_action = "return_response";
  data.meeting.progress.completion_check.ready_to_return = true;
  data.meeting.log.updated_at = timestamp();
  writeYaml(filePath, data);
  syncBlackboardFromMeeting(data.meeting);
  archiveMeetingLog(data.meeting);
  resetMeetingState();
}

// ── server ──

const server = new McpServer({
  name: "usurahi-queue",
  version: "1.0.0",
});

// ── 1. get_bulletin ──

server.tool(
  "get_bulletin",
  "掲示板(noticeboard.yaml)の雑多メモ一覧を取得する。正式依頼の入口ではない。statusでフィルタ可能。",
  { status: z.enum(["new", "in_progress", "done", "all"]).default("all").describe("フィルタするステータス") },
  async ({ status }) => {
    const data = readYaml(path.join(QUEUE, "noticeboard.yaml"));
    if (!data?.posts) return { content: [{ type: "text", text: "投稿なし" }] };
    const posts = status === "all" ? data.posts : data.posts.filter((p) => p.status === status);
    return { content: [{ type: "text", text: yaml.dump(posts, { lineWidth: -1 }) }] };
  }
);

// ── 2. post_bulletin_response ──

server.tool(
  "post_bulletin_response",
  "掲示板メモに追記を書き込み、statusをdoneにする。正式依頼への返答ではなく、雑多メモの整理に使う。",
  {
    post_id: z.string().describe("投稿のID (例: post_001)"),
    response: z.string().describe("ユーザーへの結果報告テキスト"),
  },
  async ({ post_id, response }) => {
    const filePath = path.join(QUEUE, "noticeboard.yaml");
    const data = readYaml(filePath) || { posts: [] };
    const post = data.posts?.find((p) => p.id === post_id);
    if (!post) return { content: [{ type: "text", text: `エラー: ${post_id} が見つからない` }] };
    post.status = "done";
    post.response = response;
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${post_id} を done に更新、レスポンス追記完了` }] };
  }
);

// ── 3. get_room_requests ──

server.tool(
  "get_room_requests",
  "部室の正式依頼キュー(room_requests.yaml)を取得する。持ち込まれた依頼を確認する時に使う。",
  { status: z.enum(["new", "in_progress", "done", "all"]).default("all").describe("フィルタするステータス") },
  async ({ status }) => {
    const data = readYaml(path.join(QUEUE, "room_requests.yaml"));
    if (!data?.requests) return { content: [{ type: "text", text: "正式依頼なし" }] };
    const requests = status === "all" ? data.requests : data.requests.filter((r) => r.status === status);
    if (requests.length === 0) return { content: [{ type: "text", text: `${status}の正式依頼なし` }] };
    return { content: [{ type: "text", text: yaml.dump(requests, { lineWidth: -1 }) }] };
  }
);

// ── 4. submit_room_request ──

server.tool(
  "submit_room_request",
  "部室の正式依頼キュー(room_requests.yaml)に依頼を追加する。依頼の入口。",
  {
    request_id: z.string().describe("依頼ID (例: request_001)"),
    request: z.string().describe("依頼本文"),
    background: z.string().default("").describe("依頼の背景や why"),
    requester: z.string().default("requester").describe("依頼者名"),
  },
  async ({ request_id, request, background, requester }) => {
    const filePath = path.join(QUEUE, "room_requests.yaml");
    const data = readYaml(filePath) || { requests: [] };
    if (!data.requests) data.requests = [];
    if (data.requests.some((item) => item.id === request_id)) {
      return { content: [{ type: "text", text: `エラー: ${request_id} は既に存在する` }] };
    }

    data.requests.push({
      id: request_id,
      request,
      background: background || null,
      requester,
      status: "new",
      created_at: timestamp(),
      response: null,
    });
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${request_id} を部室の正式依頼として追加完了` }] };
  }
);

// ── 5. respond_room_request ──

server.tool(
  "respond_room_request",
  "部室の正式依頼に部としての返答を書き込み、statusをdoneにする。えるの提出に使う。",
  {
    request_id: z.string().describe("依頼ID (例: request_001)"),
    response: z.string().describe("部としての返答"),
  },
  async ({ request_id, response }) => {
    const filePath = path.join(QUEUE, "room_requests.yaml");
    const data = readYaml(filePath) || { requests: [] };
    const request = data.requests?.find((item) => item.id === request_id);
    if (!request) return { content: [{ type: "text", text: `エラー: ${request_id} が見つからない` }] };
    request.status = "done";
    request.response = response;
    request.responded_at = timestamp();
    writeYaml(filePath, data);
    syncMeetingSubmissionFromRoomRequest({ request_id, response });
    return { content: [{ type: "text", text: `${request_id} への返答を記録完了` }] };
  }
);

// ── 6. update_room_request_status ──

server.tool(
  "update_room_request_status",
  "部室の正式依頼のstatusを更新する。会議開始時の in_progress や、必要な運用補助に使う。",
  {
    request_id: z.string().describe("依頼ID (例: request_001)"),
    status: z.enum(["new", "in_progress", "done"]).describe("新しいステータス"),
  },
  async ({ request_id, status }) => {
    const filePath = path.join(QUEUE, "room_requests.yaml");
    const data = readYaml(filePath) || { requests: [] };
    const request = data.requests?.find((item) => item.id === request_id);
    if (!request) return { content: [{ type: "text", text: `エラー: ${request_id} が見つからない` }] };
    request.status = status;
    if (status === "in_progress") request.started_at = timestamp();
    if (status === "done") request.responded_at = timestamp();
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${request_id} を ${status} に更新完了` }] };
  }
);

// ── 7. get_meeting ──

server.tool(
  "get_meeting",
  "部会データ(gijiroku.yaml)を取得する。",
  {},
  async () => {
    const data = readYaml(path.join(QUEUE, "gijiroku.yaml"));
    if (!data) return { content: [{ type: "text", text: "部会データなし" }] };
    if (data.meeting) ensureMeetingProgressDefaults(data.meeting);
    return { content: [{ type: "text", text: yaml.dump(data, { lineWidth: -1 }) }] };
  }
);

// ── 8. update_meeting ──

server.tool(
  "update_meeting",
  "部会データ(gijiroku.yaml)の指定フィールドを更新する。会議フェーズの状態を記録する時に使う。",
  {
    field: z
      .string()
      .describe("更新するフィールドのパス (例: 'phase', 'why.background', 'how.concerns', 'what.conclusion', 'blackboard.tasks')"),
    value: z.string().describe("設定する値（YAML文字列として解釈される）"),
  },
  async ({ field, value }) => {
    const filePath = path.join(QUEUE, "gijiroku.yaml");
    const data = readYaml(filePath) || { meeting: null };
    if (!data.meeting || typeof data.meeting !== "object" || data.meeting.status === "closed") {
      return {
        content: [
          {
            type: "text",
            text: "エラー: 更新対象のアクティブな部会がない",
          },
        ],
      };
    }
    const meeting = ensureMeetingProgressDefaults(data.meeting);

    // ドット区切りのパスでネストされたフィールドを更新
    const keys = field.split(".");
    let obj = meeting;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined || obj[keys[i]] === null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    // valueをYAMLとしてパースして適切な型にする
    let parsedValue;
    try {
      parsedValue = yaml.load(value);
    } catch {
      parsedValue = value;
    }
    obj[keys[keys.length - 1]] = parsedValue;

    data.meeting = meeting;
    ensureMeetingProgressDefaults(data.meeting);
    if (!data.meeting.log) data.meeting.log = { created_at: timestamp(), updated_at: timestamp() };
    data.meeting.log.updated_at = timestamp();
    syncDerivedBlackboardFields(data.meeting, field);
    writeYaml(filePath, data);
    syncBlackboardFromMeeting(data.meeting);
    return { content: [{ type: "text", text: `meeting.${field} を更新完了` }] };
  }
);

// ── 9. create_meeting ──

server.tool(
  "create_meeting",
  "新しい部会データ(gijiroku.yaml)を作成する。依頼を会議サイクルに載せる時に使う。",
  {
    meeting_id: z.string().describe("部会ID (例: meeting_002)"),
    project_path: z.string().describe("プロジェクトのパス"),
    request_id: z.string().optional().describe("正式依頼ID (例: request_001)"),
    request: z.string().optional().describe("持ち込まれた依頼本文"),
    agenda: z.string().optional().describe("旧仕様互換の議題。request がない場合に使う"),
  },
  async ({ meeting_id, project_path, request_id, request, agenda }) => {
    const filePath = path.join(QUEUE, "gijiroku.yaml");
    const effectiveRequest = request || agenda;
    if (!effectiveRequest) {
      return { content: [{ type: "text", text: "エラー: request または agenda が必要" }] };
    }
    const data = createMeetingState({ meeting_id, project_path, request: effectiveRequest });
    ensureMeetingProgressDefaults(data.meeting);
    if (request_id) {
      data.meeting.request_id = request_id;
      syncRoomRequestStatus({ request_id, status: "in_progress" });
    }
    writeYaml(filePath, data);
    syncBlackboardFromMeeting(data.meeting);
    return { content: [{ type: "text", text: `部会 ${meeting_id} を作成完了` }] };
  }
);

// ── 10. assign_task ──

server.tool(
  "assign_task",
  "必要な実装タスクを部員に割り当てる。会議で結論が出た後にだけ使う。tasks/<名前>.yamlに書き込む。",
  {
    assignee: z.enum(["oreki", "kyon", "nagato"]).describe("担当者"),
    task_id: z.string().describe("タスクID (例: task_002a)"),
    meeting_id: z.string().describe("部会ID"),
    description: z.string().describe("タスクの内容"),
    project_path: z.string().describe("プロジェクトのパス"),
  },
  async ({ assignee, task_id, meeting_id, description, project_path }) => {
    const filePath = path.join(QUEUE, "tasks", `${assignee}.yaml`);
    const data = {
      task: {
        task_id,
        meeting_id,
        description,
        project_path,
        status: "assigned",
        timestamp: timestamp(),
      },
    };
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${assignee} にタスク ${task_id} をアサイン完了` }] };
  }
);

// ── 11. get_my_task ──

server.tool(
  "get_my_task",
  "自分のタスクファイル(tasks/<名前>.yaml)を読む。部員が自分のタスクを確認する時に使う。",
  {
    worker: z.enum(["oreki", "kyon", "nagato"]).describe("部員名"),
  },
  async ({ worker }) => {
    const data = readYaml(path.join(QUEUE, "tasks", `${worker}.yaml`));
    if (!data) return { content: [{ type: "text", text: "タスクなし" }] };
    return { content: [{ type: "text", text: yaml.dump(data, { lineWidth: -1 }) }] };
  }
);

// ── 12. update_task_status ──

server.tool(
  "update_task_status",
  "自分のタスクのstatusを更新する (assigned→in_progress→done)。",
  {
    worker: z.enum(["oreki", "kyon", "nagato"]).describe("部員名"),
    status: z.enum(["in_progress", "done", "rework"]).describe("新しいステータス"),
  },
  async ({ worker, status }) => {
    const filePath = path.join(QUEUE, "tasks", `${worker}.yaml`);
    const data = readYaml(filePath);
    if (!data?.task) return { content: [{ type: "text", text: "タスクが見つからない" }] };
    data.task.status = status;
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${worker} のタスクを ${status} に更新完了` }] };
  }
);

// ── 13. submit_report ──

server.tool(
  "submit_report",
  "作業報告を書き込む(reports/<名前>_report.yaml)。部員がタスク完了時に使う。",
  {
    worker: z.enum(["oreki", "kyon", "nagato"]).describe("部員名"),
    task_id: z.string().describe("タスクID"),
    meeting_id: z.string().describe("部会ID"),
    status: z.enum(["done", "failed"]).describe("結果ステータス"),
    summary: z.string().describe("結果の要約"),
    files_modified: z.array(z.string()).default([]).describe("変更したファイル一覧"),
    notes: z.string().default("").describe("備考"),
  },
  async ({ worker, task_id, meeting_id, status, summary, files_modified, notes }) => {
    const filePath = path.join(QUEUE, "reports", `${worker}_report.yaml`);
    const data = {
      worker,
      task_id,
      meeting_id,
      timestamp: timestamp(),
      status,
      result: {
        summary,
        files_modified,
        notes,
      },
    };
    writeYaml(filePath, data);
    return { content: [{ type: "text", text: `${worker} のレポート提出完了` }] };
  }
);

// ── 14. get_report ──

server.tool(
  "get_report",
  "部員の報告(reports/<名前>_report.yaml)を読む。えるが結果を集約する時に使う。",
  {
    worker: z.enum(["oreki", "kyon", "nagato"]).describe("部員名"),
  },
  async ({ worker }) => {
    const data = readYaml(path.join(QUEUE, "reports", `${worker}_report.yaml`));
    if (!data) return { content: [{ type: "text", text: `${worker} の報告なし` }] };
    return { content: [{ type: "text", text: yaml.dump(data, { lineWidth: -1 }) }] };
  }
);

// ── 15. save_to_obsidian ──

server.tool(
  "save_to_obsidian",
  "Obsidian Vaultにナレッジノートを保存する。アーカイブや活動記録をObsidianに記録する時に使う。フロントマター(tags, date等)とwiki-linkを自動付与。",
  {
    category: z.enum(["archive", "activity_log", "library"]).describe("保存先カテゴリ（archive=氷菓/部会知見, activity_log=活動記録, library=薄氷図書館/汎用ナレッジ）"),
    title: z.string().describe("ノートのタイトル（ファイル名になる）"),
    content: z.string().describe("ノートの本文（Markdown）"),
    tags: z.array(z.string()).default([]).describe("タグ一覧 (例: ['TypeScript', 'テスト', '設計パターン'])"),
    related: z.array(z.string()).default([]).describe("関連ノートのタイトル（wiki-linkになる）"),
  },
  async ({ category, title, content, tags, related }) => {
    const filePath = writeObsidianNote({ category, title, content, tags, related });
    const folderName = OBSIDIAN_FOLDERS[category] || category;

    return { content: [{ type: "text", text: `Obsidian保存完了: 薄氷/${folderName}/${sanitizeNoteTitle(title)}.md` }] };
  }
);

// ── 16. create_archive_entry ──

server.tool(
  "create_archive_entry",
  "活動記録からバックナンバーを編む。『面白い』『次に使える』の両方が揃った時だけ使う。",
  {
    source_title: z.string().describe("元になった活動記録のタイトル"),
    title: z.string().describe("バックナンバーのタイトル"),
    use_cases: z.array(z.string()).min(1).describe("どういう時に使うか"),
    method: z.array(z.string()).min(1).describe("やり方"),
    cautions: z.array(z.string()).default([]).describe("気をつけること"),
    fun_reason: z.string().describe("面白かった理由"),
    interesting: z.boolean().describe("ハルヒが面白いと認めたか"),
    reusable: z.boolean().describe("えるが次に使えると認めたか"),
  },
  async ({ source_title, title, use_cases, method, cautions, fun_reason, interesting, reusable }) => {
    if (!interesting || !reusable) {
      return {
        content: [
          {
            type: "text",
            text: "バックナンバー化しない。面白いことと再利用性の両方が必要。",
          },
        ],
      };
    }

    const result = archiveEntry({
      title,
      use_cases,
      method,
      cautions,
      fun_reason,
      source_title,
    });

    if (result.error) {
      return { content: [{ type: "text", text: result.error }] };
    }

    return {
      content: [
        {
          type: "text",
          text: `バックナンバー化完了: Vol.${String(result.volume).padStart(2, "0")} (${result.filename})`,
        },
      ],
    };
  }
);

// ── 17. search_obsidian ──

server.tool(
  "search_obsidian",
  "Obsidian Vault内の薄氷ナレッジを検索する。過去の知見を参照したい時に使う。キーワードでファイル名と内容を横断検索。",
  {
    query: z.string().describe("検索キーワード"),
    category: z.enum(["archive", "activity_log", "library", "all"]).default("all").describe("検索対象カテゴリ"),
  },
  async ({ query, category }) => {
    const searchDirs = [];
    if (category === "all" || category === "archive") {
      searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.archive));
    }
    if (category === "all" || category === "activity_log") {
      searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.activity_log));
    }
    if (category === "all" || category === "library") {
      searchDirs.push(path.join(OBSIDIAN_USURAHI, OBSIDIAN_FOLDERS.library));
    }

    const results = [];
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();

        if (file.toLowerCase().includes(lowerQuery) || lowerContent.includes(lowerQuery)) {
          // Extract matching lines for context
          const lines = content.split("\n");
          const matchLines = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              matchLines.push(`L${i + 1}: ${lines[i].substring(0, 100)}`);
              if (matchLines.length >= 3) break;
            }
          }
          const rel = path.relative(OBSIDIAN_USURAHI, filePath);
          results.push({
            file: rel,
            title: file.replace(".md", ""),
            matches: matchLines.length > 0 ? matchLines : ["(ファイル名マッチ)"],
          });
        }
      }
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `「${query}」に一致するノートなし` }] };
    }

    const output = results
      .map((r) => `## [[${r.title}]]\nパス: ${r.file}\n${r.matches.join("\n")}`)
      .join("\n\n");
    return { content: [{ type: "text", text: `${results.length}件ヒット:\n\n${output}` }] };
  }
);

// ── 18. read_obsidian_note ──

server.tool(
  "read_obsidian_note",
  "Obsidian Vault内の薄氷ノートを読む。search_obsidianで見つけたノートの詳細を確認する時に使う。",
  {
    title: z.string().describe("ノートのタイトル（拡張子なし）"),
    category: z.enum(["archive", "activity_log", "library"]).default("archive").describe("カテゴリ"),
  },
  async ({ title, category }) => {
    const folderName = OBSIDIAN_FOLDERS[category] || category;
    const safeTitle = sanitizeNoteTitle(title);
    const filePath = path.join(OBSIDIAN_USURAHI, folderName, `${safeTitle}.md`);
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: "text", text: `ノートが見つからない: ${title}` }] };
    }
    const content = fs.readFileSync(filePath, "utf8");
    return { content: [{ type: "text", text: content }] };
  }
);

// ── 19. add_to_library_queue ──

server.tool(
  "add_to_library_queue",
  "薄氷図書館のURLキューにURLを追加する。/libraryスキルから呼ばれる。",
  {
    url: z.string().describe("追加するURL"),
    note: z.string().default("").describe("メモ（任意）"),
  },
  async ({ url, note }) => {
    const data = loadPendingQueue();
    if (!data.urls) data.urls = [];

    // 重複チェック
    if (data.urls.some((item) => item.url === url && item.status !== "done")) {
      return { content: [{ type: "text", text: `既にキューにある: ${url}` }] };
    }

    data.urls.push({
      url,
      note,
      status: "pending",
      added_at: timestamp(),
    });
    savePendingQueue(data);
    const pending = data.urls.length;
    return { content: [{ type: "text", text: `キューに追加: ${url}（未処理: ${pending}件）` }] };
  }
);

// ── 20. get_library_queue ──

server.tool(
  "get_library_queue",
  "薄氷図書館のURLキューを取得する。摩耶花が処理対象を確認する時に使う。",
  {
    status: z.enum(["pending", "failed", "history", "all"]).default("pending").describe("フィルタするステータス"),
  },
  async ({ status }) => {
    const queue = loadPendingQueue().urls || [];
    const history = loadLibraryHistory().entries || [];
    if (status === "pending") {
      if (queue.length === 0) return { content: [{ type: "text", text: "pendingのURLなし" }] };
      return { content: [{ type: "text", text: yaml.dump(queue, { lineWidth: -1 }) }] };
    }
    if (status === "failed") {
      const failed = history.filter((u) => u.status === "failed");
      if (failed.length === 0) return { content: [{ type: "text", text: "failedのURLなし" }] };
      return { content: [{ type: "text", text: yaml.dump(failed, { lineWidth: -1 }) }] };
    }
    if (status === "history") {
      if (history.length === 0) return { content: [{ type: "text", text: "履歴なし" }] };
      return { content: [{ type: "text", text: yaml.dump(history, { lineWidth: -1 }) }] };
    }
    const all = [...queue, ...history];
    if (all.length === 0) return { content: [{ type: "text", text: "キューと履歴は空" }] };
    return { content: [{ type: "text", text: yaml.dump(all, { lineWidth: -1 }) }] };
  }
);

// ── 21. update_library_queue ──

server.tool(
  "update_library_queue",
  "薄氷図書館のURLキューのアイテムのstatusを更新する。摩耶花が処理完了時に使う。",
  {
    url: z.string().describe("対象のURL"),
    status: z.enum(["done", "failed"]).describe("新しいステータス"),
  },
  async ({ url, status }) => {
    const data = loadPendingQueue();
    const item = data.urls?.find((u) => u.url === url);
    if (!item) return { content: [{ type: "text", text: `キューに見つからない: ${url}` }] };
    item.status = status;
    item.processed_at = timestamp();
    recordLibraryHistory(item);
    data.urls = data.urls.filter((u) => u.url !== url);
    savePendingQueue(data);
    return { content: [{ type: "text", text: `${url} を ${status} にして履歴へ移した` }] };
  }
);

// ── start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCPサーバー起動エラー:", err);
  process.exit(1);
});
