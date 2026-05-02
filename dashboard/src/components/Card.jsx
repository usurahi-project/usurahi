export function Card({ title, tone = "ok", value, note, children }) {
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
