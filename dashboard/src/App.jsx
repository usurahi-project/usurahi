import { NoticeboardPanel } from "./components/NoticeboardPanel.jsx";
import { SchoolCyclePanel } from "./components/SchoolCyclePanel.jsx";
import { SourceErrorsPanel } from "./components/SourceErrorsPanel.jsx";
import { StatusCards } from "./components/StatusCards.jsx";
import { useSchoolStatus } from "./hooks/useSchoolStatus.js";
import { formatTime } from "./utils/status.js";

function App() {
  const { status, error } = useSchoolStatus();

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

      <StatusCards status={status} />
      <SchoolCyclePanel tasks={status.school_cycle.tasks} />
      <NoticeboardPanel posts={status.noticeboard.latest_open_posts} />
      <SourceErrorsPanel sourceErrors={status.school_watch.source_errors} />
    </main>
  );
}

export default App;
