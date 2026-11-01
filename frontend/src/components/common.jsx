import Icon from "./Icon";
import { STAGES } from "../stages";

export function StageCard({ stage, title, description, done, method, note, children, action }) {
  const meta = STAGES[stage - 1];
  return (
    <section className={`card stage-card ${done ? "is-done" : ""}`} id={`stage-${stage}`} aria-labelledby={`stage-${stage}-title`}>
      <header className="stage-head">
        <span className="stage-icon" aria-hidden="true">
          <Icon name={done ? "check" : meta.icon} size={18} />
        </span>
        <div className="stage-heading">
          <span className="eyebrow">
            Stage {stage}
            {done && <span className="eyebrow-done">, complete</span>}
          </span>
          <h2 id={`stage-${stage}-title`}>{title}</h2>
          {description && <p className="stage-desc">{description}</p>}
        </div>
        <div className="stage-actions">
          {method && <MethodChip method={method} note={note} />}
          {action}
        </div>
      </header>
      {children && <div className="stage-body">{children}</div>}
    </section>
  );
}

export function MethodChip({ method, note }) {
  const llm = method === "llm";
  return (
    <span className={`chip ${llm ? "chip-accent" : ""}`} title={note || (llm ? "Generated with the LLM" : "Rule-based fallback")}>
      <Icon name={llm ? "sparkle" : "layers"} size={12} />
      {llm ? "LLM-assisted" : "Heuristic"}
    </span>
  );
}

export function Tags({ items, variant = "" }) {
  if (!items?.length) return <span className="muted small">—</span>;
  return (
    <div className="tags">
      {items.map((t) => (
        <span key={t} className={`tag ${variant}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function RunButton({ label, rerunLabel, done, running, disabled, onClick }) {
  return (
    <button className={`btn ${done ? "btn-secondary" : "btn-primary"}`} disabled={disabled} onClick={onClick}>
      {running ? <span className="spinner sm" aria-hidden="true" /> : <Icon name={done ? "refresh" : "arrowRight"} size={14} />}
      {running ? "Running…" : done ? rerunLabel || "Re-run" : label}
    </button>
  );
}

export function Alert({ kind = "info", children }) {
  const icon = { info: "info", error: "alert", warn: "alert" }[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}
