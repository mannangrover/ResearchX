import { useState } from "react";
import Icon from "./Icon";
import { RunButton, StageCard } from "./common";
import ScoreComparison from "./ScoreComparison";

export const BAND_CLASS = { Strong: "band-strong", Moderate: "band-moderate", Limited: "band-limited", Weak: "band-weak" };
const BANDS = [
  ["Weak", 0],
  ["Limited", 35],
  ["Moderate", 50],
  ["Strong", 70],
];

function Gauge({ value, band }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  return (
    <div className={`gauge ${BAND_CLASS[band]}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Research Opportunity Score ${value.toFixed(1)} out of 100, ${band}`}>
        <circle cx="60" cy="60" r={r} className="gauge-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="gauge-value"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="gauge-label" aria-hidden="true">
        <b>{value.toFixed(1)}</b>
        <span>out of 100</span>
      </div>
    </div>
  );
}

function BandScale({ band }) {
  return (
    <ol className="band-scale" aria-label="Score bands">
      {BANDS.map(([name, min]) => (
        <li key={name} className={`${BAND_CLASS[name]} ${name === band ? "active" : ""}`}>
          <span className="band-swatch" aria-hidden="true" />
          {name}
          <span className="muted">{min === 0 ? "<35" : `≥${min}`}</span>
        </li>
      ))}
    </ol>
  );
}

function Dimension({ d }) {
  const [open, setOpen] = useState(false);
  const level = d.score >= 7 ? "hi" : d.score >= 4.5 ? "mid" : "lo";
  return (
    <li className={`dim ${open ? "open" : ""}`}>
      <button className="dim-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dim-name">
          {d.name}
          <span className="dim-weight">{Math.round(d.weight * 100)}%</span>
        </span>
        <span className="dim-bar" aria-hidden="true">
          <span style={{ width: `${d.score * 10}%` }} className={level} />
        </span>
        <span className="dim-score">
          {d.score.toFixed(1)}
          <span className="muted">/10</span>
        </span>
        <Icon name="chevronDown" size={16} className="chev" />
      </button>
      {open && (
        <ul className="reasons">
          {d.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ScorePanel({ data, running, disabled, onRun }) {
  const action = <RunButton label="Compute Score" done={!!data} running={running} disabled={disabled} onClick={onRun} />;

  if (!data) {
    return (
      <StageCard
        stage={4}
        title="Research Opportunity Score"
        description="Scores six measurable dimensions (literature overlap, technical depth, feasibility, potential impact, reproducibility and contribution potential) and combines them into a 0–100 score."
        action={action}
      />
    );
  }

  return (
    <StageCard stage={4} title="Research Opportunity Score" done method={data.method} note={data.note} action={action}>
      <div className="score-layout">
        <div className="score-summary">
          <Gauge value={data.total} band={data.band} />
          <span className={`band ${BAND_CLASS[data.band]}`}>{data.band} opportunity</span>
          <BandScale band={data.band} />
        </div>
        <div className="score-detail">
          <p className="summary">{data.explanation}</p>
          <div className="dims-head">
            <span>Dimension · weight</span>
            <span>Score</span>
          </div>
          <ul className="dims">
            {data.dimensions.map((d) => (
              <Dimension key={d.key} d={d} />
            ))}
          </ul>
          <p className="small muted">
            Expand a dimension to see the evidence behind it. {data.disclaimer}
          </p>
        </div>
      </div>
      <ScoreComparison rule={data} llm={data.llm_score} comparison={data.comparison} note={data.llm_score_note} />
    </StageCard>
  );
}
