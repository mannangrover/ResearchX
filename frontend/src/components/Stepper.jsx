import { useRef } from "react";
import Icon from "./Icon";
import { BUILT_STAGES, MODULES, STAGES } from "../stages";

// Workflow progress that doubles as the tab list for the project's stages.
export default function Stepper({ completed, available, selected, onSelect, runningStage }) {
  const listRef = useRef(null);

  // Arrow keys move between enabled tabs (WAI-ARIA tabs pattern)
  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const enabled = STAGES.filter((s) => available.includes(s.n)).map((s) => s.n);
    const i = enabled.indexOf(selected);
    const k = keys[e.key];
    const next = k === "first" ? enabled[0] : k === "last" ? enabled.at(-1) : enabled[(i + k + enabled.length) % enabled.length];
    onSelect(next);
    listRef.current?.querySelector(`#tab-stage-${next}`)?.focus();
  };

  return (
    <nav className="card stepper-card" aria-label="Workflow stages">
      <div className="stepper-head">
        <span className="eyebrow">Workflow</span>
        <span className="small muted">
          <strong className="text">{completed}</strong> of {BUILT_STAGES} live stages complete · {STAGES.length - BUILT_STAGES}{" "}
          planned
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(completed / STAGES.length) * 100}%` }} />
      </div>
      <div className="modules" aria-hidden="true">
        {MODULES.map((m) => (
          <span
            key={m.n}
            className={`module ${m.stages.includes(selected) ? "active" : ""}`}
            style={{ gridColumn: `${m.stages[0]} / ${m.stages.at(-1) + 1}` }}
            title={`Module ${m.n}: ${m.name} → ${m.output}`}
          >
            <b>M{m.n}</b> {m.name}
          </span>
        ))}
      </div>
      <div className="stepper" role="tablist" aria-label="Project stages" ref={listRef} onKeyDown={onKeyDown}>
        {STAGES.map((s) => {
          const state = s.n <= completed ? "done" : s.n === completed + 1 && s.built ? "current" : s.built ? "todo" : "locked";
          const enabled = available.includes(s.n);
          const isSelected = s.n === selected;
          return (
            <button
              key={s.n}
              type="button"
              role="tab"
              id={`tab-stage-${s.n}`}
              aria-selected={isSelected}
              aria-controls={enabled ? `panel-stage-${s.n}` : undefined}
              tabIndex={isSelected ? 0 : -1}
              disabled={!enabled}
              className={`step ${state} ${isSelected ? "selected" : ""}`}
              title={`${s.name} → ${s.output}${s.built ? "" : " (planned)"}`}
              onClick={() => onSelect(s.n)}
            >
              <span className="step-dot">
                {runningStage === s.n ? (
                  <span className="spinner xs" aria-hidden="true" />
                ) : state === "done" ? (
                  <Icon name="check" size={13} />
                ) : (
                  s.n
                )}
              </span>
              <span className="step-name">{s.short}</span>
              {!s.built && <span className="step-soon">Soon</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
