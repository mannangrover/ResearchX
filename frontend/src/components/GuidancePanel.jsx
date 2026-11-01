import Icon from "./Icon";
import { Alert, StageCard } from "./common";

const READY_CLASS = { ready: "band-strong", almost: "band-limited", revise: "band-weak" };
const READY_TEXT = {
  ready: "The paper delivers what it sets out to do and has no blocking issues.",
  almost: "The paper is close. Fix the issues below before submitting.",
  revise: "The paper needs another revision before it is worth submitting.",
};
const TIER_ICON = { top: "star", mid: "target", entry: "lightbulb" };
const pct = (v) => `${Math.round(v * 100)}%`;

export default function GuidancePanel({ project, running, disabled, onRun }) {
  const g = project.guidance;
  const run = (
    <button className={`btn ${g ? "btn-secondary btn-sm" : "btn-primary"}`} disabled={disabled} onClick={onRun}>
      {running ? <span className="spinner sm" aria-hidden="true" /> : <Icon name={g ? "refresh" : "rocket"} size={14} />}
      {running ? "Assessing…" : g ? "Re-assess" : "Assess Publication Readiness"}
    </button>
  );

  if (!g) {
    return (
      <StageCard
        stage={10}
        title="Publication guidance"
        description="Combines your paper evaluation (stage 8) with the research opportunity (stage 4) to tell you whether the paper is ready to submit and which tier of venue to aim for. Every rule and number is shown."
        action={run}
      />
    );
  }

  const r = g.readiness;
  const t = g.tier;
  return (
    <StageCard stage={10} title="Publication guidance" done action={run}>
      <div className="plan-section">
      <p className="small muted">
        Based on draft {g.based_on.paper_draft} ({g.based_on.paper_file}). Upload a revised draft in stage 8 and re-assess to
        update it.
      </p>

      <div className="guidance-head">
        <div className="guidance-card">
          <span className="eyebrow">Readiness</span>
          <strong className={READY_CLASS[r.level]}>{r.label}</strong>
          <span className="small muted">
            Paper score {r.paper_score.toFixed(1)} / 100. {READY_TEXT[r.level]}
          </span>
        </div>
        <div className="guidance-card">
          <span className="eyebrow">Target tier{t.after_revision ? " (after revision)" : ""}</span>
          <strong>
            <Icon name={TIER_ICON[t.key]} size={18} /> {t.name}
          </strong>
          <span className="small muted">{t.examples}</span>
        </div>
      </div>

      {r.blockers.length > 0 && (
        <div>
          <h3 className="sub-title">
            <Icon name="alert" size={15} /> Fix before submitting
          </h3>
          <ul className="fix-list">
            {r.blockers.map((b, i) => (
              <li key={i}>
                <span className="dot dot-high" />
                <div>
                  <strong>{b.issue}</strong>
                  <span className="small muted">{b.fix}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="sub-title">
          <Icon name="gauge" size={15} /> Why this tier — strength {g.strength.toFixed(2)}
        </h3>
        <ul className="criteria">
          {g.factors.map((f) => (
            <li key={f.key}>
              <div className="criteria-head">
                <strong>{f.name}</strong>
                <span className="tabular">
                  {pct(f.value)} <span className="muted">× {f.weight}</span>
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: pct(f.value) }} />
              </div>
            </li>
          ))}
        </ul>
        <div className="table-wrap tier-rules">
          <table className="compare-table">
            <tbody>
              {["top", "mid", "entry"].map((k) => (
                <tr key={k} className={k === t.key ? "row-current" : ""}>
                  <th scope="row">{{ top: "Top-tier venue", mid: "Mid-tier venue", entry: "Workshop or student track" }[k]}</th>
                  <td>{g.thresholds[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {g.next_tier && (
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="arrowRight" size={15} /> To reach {g.next_tier.name.toLowerCase()}
          </h3>
          {g.next_tier.unmet.length > 0 && (
            <p className="small">
              Missing:{" "}
              {g.next_tier.unmet.map((u, i) => (
                <span key={u.name}>
                  {i > 0 && ", "}
                  {u.name.toLowerCase()} is {u.name === "Strength" ? u.value.toFixed(2) : pct(u.value)}, needs{" "}
                  {u.name === "Strength" ? u.needed.toFixed(2) : pct(u.needed)}
                </span>
              ))}
              .
            </p>
          )}
          <ul className="check-list">
            {g.to_move_up.map((m) => (
              <li key={m.factor}>
                <strong>{m.factor}</strong> ({pct(m.value)}): {m.advice}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Alert kind="info">
        Guidance only. Check each venue's scope, ranking and deadlines yourself before submitting.
      </Alert>
      </div>
    </StageCard>
  );
}
