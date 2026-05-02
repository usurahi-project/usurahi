export const EMPTY_STATUS = {
  generated_at: "",
  school_name: "薄氷",
  autopilot: { running: false, pid: null, last_log_line: "" },
  library: {
    pending_count: 0,
    done_history_count: 0,
    failed_history_count: 0,
    latest_failed: null,
    last_maintenance: "",
  },
  noticeboard: { total_posts: 0, open_posts: 0, latest_open_posts: [] },
  school_watch: { last_checked_at: "", age_minutes: null, source_errors: [] },
  school_cycle: { tasks: [] },
  links: { vault_dashboard_html: "", vault_dashboard_dir: "" },
};

export function normalizeStatus(data) {
  const next = data && typeof data === "object" ? data : {};

  return {
    ...EMPTY_STATUS,
    ...next,
    autopilot: {
      ...EMPTY_STATUS.autopilot,
      ...(next.autopilot || {}),
    },
    library: {
      ...EMPTY_STATUS.library,
      ...(next.library || {}),
      latest_failed: next.library?.latest_failed || null,
    },
    noticeboard: {
      ...EMPTY_STATUS.noticeboard,
      ...(next.noticeboard || {}),
      latest_open_posts: Array.isArray(next.noticeboard?.latest_open_posts)
        ? next.noticeboard.latest_open_posts
        : [],
    },
    school_watch: {
      ...EMPTY_STATUS.school_watch,
      ...(next.school_watch || {}),
      source_errors: Array.isArray(next.school_watch?.source_errors)
        ? next.school_watch.source_errors
        : [],
    },
    school_cycle: {
      ...EMPTY_STATUS.school_cycle,
      ...(next.school_cycle || {}),
      tasks: Array.isArray(next.school_cycle?.tasks) ? next.school_cycle.tasks : [],
    },
    links: {
      ...EMPTY_STATUS.links,
      ...(next.links || {}),
    },
  };
}

export function formatTime(value) {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function statusTone(kind, value) {
  if (kind === "autopilot") return value ? "ok" : "alert";
  if (kind === "queue") return value === 0 ? "ok" : value < 3 ? "warn" : "alert";
  if (kind === "history") return value === 0 ? "ok" : "warn";
  if (kind === "watch-age") return value !== null && value < 360 ? "ok" : "warn";
  return "ok";
}
