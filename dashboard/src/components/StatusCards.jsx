import { Card } from "./Card.jsx";
import { formatTime, statusTone } from "../utils/status.js";

export function StatusCards({ status }) {
  return (
    <>
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
          <p className="detail">source error: {status.school_watch.source_errors.length}件</p>
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
    </>
  );
}
