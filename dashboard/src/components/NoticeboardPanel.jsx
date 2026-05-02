import { formatTime } from "../utils/status.js";

export function NoticeboardPanel({ posts }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>掲示板の未解決</h2>
        <p>学校巡回が起票したものを中心に見る</p>
      </div>
      <div className="post-list">
        {posts.length === 0 ? (
          <p className="detail">未解決の投稿はない。</p>
        ) : (
          posts.map((post) => (
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
  );
}
