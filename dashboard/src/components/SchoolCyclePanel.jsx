import { formatTime } from "../utils/status.js";

export function SchoolCyclePanel({ tasks }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>school-cycle</h2>
        <p>各巡回タスクの最後の動き</p>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <article key={task.id} className={`task ${task.last_error ? "task-alert" : ""}`}>
            <h3>{task.id}</h3>
            <p>最終実行: {formatTime(task.last_run_at)}</p>
            <p>{task.age_minutes === null ? "経過不明" : `${task.age_minutes}分前`}</p>
            {task.last_error ? <p className="task-error">error: {task.last_error}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
