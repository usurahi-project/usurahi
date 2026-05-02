import { formatTime } from "../utils/status.js";

export function SourceErrorsPanel({ sourceErrors }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>外部巡回エラー</h2>
        <p>OpenAI / Anthropic / Zenn の巡回で詰まったもの</p>
      </div>
      <div className="post-list">
        {sourceErrors.length === 0 ? (
          <p className="detail">外部巡回エラーはない。</p>
        ) : (
          sourceErrors.map((item) => (
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
  );
}
