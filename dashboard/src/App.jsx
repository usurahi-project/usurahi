import { useEffect, useState } from "react";

const EMPTY_STATUS = {
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
  meeting: {
    active: false,
    id: "",
    phase: "",
    phase_label: "未開始",
    owner: "",
    owner_label: "",
    waiting_for: "",
    waiting_for_label: "",
    ball_holder: "",
    ball_holder_label: "なし",
    next_action: "",
    request: "",
    conclusion: "",
    updated_at: "",
    completion_checks: [],
  },
  school_watch: { last_checked_at: "", age_minutes: null, source_errors: [] },
  school_cycle: { tasks: [] },
  links: { vault_dashboard_html: "", vault_dashboard_dir: "" },
};

const MEMBERS = [
  { id: "eru", name: "える", role: "受付・結論化" },
  { id: "haruhi", name: "ハルヒ", role: "発火・方向づけ" },
  { id: "oreki", name: "折木", role: "抽出・最小案" },
  { id: "kyon", name: "キョン", role: "制動・出口確認" },
  { id: "nagato", name: "長門", role: "可否判断・実装" },
];

function formatTime(value) {
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

function statusTone(kind, value) {
  if (kind === "autopilot") return value ? "ok" : "alert";
  if (kind === "queue") return value === 0 ? "ok" : value < 3 ? "warn" : "alert";
  if (kind === "history") return value === 0 ? "ok" : "warn";
  if (kind === "watch-age") return value !== null && value < 360 ? "ok" : "warn";
  return "ok";
}

function Card({ title, tone = "ok", value, note, children }) {
  return (
    <section className={`card tone-${tone}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {value !== undefined ? <div className="metric">{value}</div> : null}
      </div>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

function ClubroomView({ meeting }) {
  const doneCount = meeting.completion_checks.filter((item) => item.done).length;
  const totalCount = meeting.completion_checks.length || 5;

  return (
    <section className="clubroom">
      <div className="clubroom-main">
        <div className="clubroom-head">
          <div>
            <p className="eyebrow">部室ビュー</p>
            <h2>{meeting.active ? meeting.phase_label : "部会はまだ始まっていない"}</h2>
          </div>
          <div className={`phase-badge ${meeting.active ? "is-active" : ""}`}>
            {meeting.active ? `ボール: ${meeting.ball_holder_label}` : "待機中"}
          </div>
        </div>

        <div className="member-row">
          {MEMBERS.map((member) => {
            const isHolder = meeting.ball_holder === member.id;
            const isOwner = meeting.owner === member.id;
            return (
              <article key={member.id} className={`member ${isHolder ? "member-hot" : ""}`}>
                <div className="member-mark">{isHolder ? "●" : isOwner ? "◐" : "○"}</div>
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.role}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="clubroom-side">
        <div className="next-action">
          <span>次の一手</span>
          <strong>{meeting.next_action || "未設定"}</strong>
        </div>
        <div className="request-box">
          <span>依頼</span>
          <p>{meeting.request || "依頼なし"}</p>
        </div>
        <div className="checks">
          <div className="checks-head">
            <span>完了条件</span>
            <strong>{doneCount}/{totalCount}</strong>
          </div>
          <div className="check-grid">
            {meeting.completion_checks.map((item) => (
              <span key={item.id} className={item.done ? "check done" : "check"}>
                {item.done ? "✓" : "□"} {item.label}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

function App() {
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("./school-status.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setStatus({ ...EMPTY_STATUS, ...data });
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadStatus();
    const timer = window.setInterval(loadStatus, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="screen">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">職員室</p>
          <h1>{status.school_name} 学校運営ダッシュボード</h1>
          <p className="lead">
            学校がちゃんと回っているかを、職員室の壁から見渡すための運営盤。
          </p>
        </div>
        <div className="hero-meta">
          <div className="stamp">
            <span>最終更新</span>
            <strong>{formatTime(status.generated_at)}</strong>
          </div>
          <div className="stamp">
            <span>配置先</span>
            <strong>{status.links.vault_dashboard_dir || "職員室/dashboard"}</strong>
          </div>
        </div>
      </header>

      {error ? (
        <section className="banner error">
          <strong>状態を読めない</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <ClubroomView meeting={status.meeting} />

      <section className="grid grid-primary">
        <Card
          title="Autopilot"
          tone={statusTone("autopilot", status.autopilot.running)}
          value={status.autopilot.running ? "稼働中" : "停止中"}
          note={status.autopilot.pid ? `pid: ${status.autopilot.pid}` : "pid なし"}
        >
          <p className="detail">{status.autopilot.last_log_line || "最新ログなし"}</p>
        </Card>

        <Card
          title="図書館キュー"
          tone={statusTone("queue", status.library.pending_count)}
          value={`${status.library.pending_count}件`}
          note="pending だけを保持"
        >
          <p className="detail">
            履歴: 完了 {status.library.done_history_count}件 / 詰まり {status.library.failed_history_count}件
          </p>
        </Card>

        <Card
          title="学校巡回"
          tone={statusTone("watch-age", status.school_watch.age_minutes)}
          value={status.school_watch.age_minutes === null ? "未記録" : `${status.school_watch.age_minutes}分前`}
          note={`最終巡回: ${formatTime(status.school_watch.last_checked_at)}`}
        >
          <p className="detail">
            source error: {status.school_watch.source_errors.length}件
          </p>
        </Card>

        <Card
          title="掲示板"
          tone={status.noticeboard.open_posts === 0 ? "ok" : "warn"}
          value={`${status.noticeboard.open_posts}件`}
          note={`全体 ${status.noticeboard.total_posts}件`}
        >
          <p className="detail">未解決の巡回メモや論点の数</p>
        </Card>
      </section>

      <section className="grid grid-secondary">
        <Card title="摩耶花の整頓" tone="ok" note="図書館の最新整頓ログ">
          <pre className="logline">{status.library.last_maintenance || "整頓記録なし"}</pre>
        </Card>

        <Card
          title="最新の詰まり"
          tone={status.library.latest_failed ? "alert" : "ok"}
          note={status.library.latest_failed ? formatTime(status.library.latest_failed.recorded_at) : "詰まりなし"}
        >
          {status.library.latest_failed ? (
            <div className="stack">
              <p><strong>URL</strong><br />{status.library.latest_failed.url}</p>
              <p><strong>段階</strong><br />{status.library.latest_failed.stage || "unknown"}</p>
              <p><strong>理由</strong><br />{status.library.latest_failed.message || "unknown"}</p>
            </div>
          ) : (
            <p className="detail">失敗履歴は今のところ空。</p>
          )}
        </Card>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>school-cycle</h2>
          <p>各巡回タスクの最後の動き</p>
        </div>
        <div className="task-list">
          {status.school_cycle.tasks.map((task) => (
            <article key={task.id} className={`task ${task.last_error ? "task-alert" : ""}`}>
              <h3>{task.id}</h3>
              <p>最終実行: {formatTime(task.last_run_at)}</p>
              <p>{task.age_minutes === null ? "経過不明" : `${task.age_minutes}分前`}</p>
              {task.last_error ? <p className="task-error">error: {task.last_error}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>掲示板の未解決</h2>
          <p>学校巡回が起票したものを中心に見る</p>
        </div>
        <div className="post-list">
          {status.noticeboard.latest_open_posts.length === 0 ? (
            <p className="detail">未解決の投稿はない。</p>
          ) : (
            status.noticeboard.latest_open_posts.map((post) => (
              <article key={post.id} className="post">
                <div className="post-meta">
                  <span>{post.id}</span>
                  <span>{post.kind || "post"}</span>
                  <span>{formatTime(post.created_at)}</span>
                </div>
                <p>{post.body}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>外部巡回エラー</h2>
          <p>OpenAI / Anthropic / Zenn の巡回で詰まったもの</p>
        </div>
        <div className="post-list">
          {status.school_watch.source_errors.length === 0 ? (
            <p className="detail">外部巡回エラーはない。</p>
          ) : (
            status.school_watch.source_errors.map((item) => (
              <article key={item.source} className="post error-post">
                <div className="post-meta">
                  <span>{item.source}</span>
                  <span>{formatTime(item.at)}</span>
                </div>
                <p>{item.message}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
