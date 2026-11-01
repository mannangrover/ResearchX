import { useRef } from "react";
import Icon from "./Icon";
import { MODULES, STAGES } from "../stages";

const MODULE_ICON = { 1: "cpu", 2: "gauge", 3: "flask", 4: "rocket" };

// Arrow keys move between the buttons of a tab list (WAI-ARIA tabs pattern)
function useArrowKeys(ids, selected, onSelect, prefix) {
  const ref = useRef(null);
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = ids[(ids.indexOf(selected) + step + ids.length) % ids.length];
    onSelect(next);
    ref.current?.querySelector(`#${prefix}-${next}`)?.focus();
  };
  return { ref, onKeyDown };
}

// Two-level navigation: the four modules, then the stages inside the open module.
export default function ModuleNav({ completed, selected, onSelect, runningStage }) {
  const builtDone = (n) => STAGES[n - 1].built && n <= completed;
  const current = MODULES.find((m) => m.stages.includes(selected)) || MODULES[0];

  // Opening a module goes to its first unfinished stage, or its headline stage when all are done
  const openModule = (m) => {
    const built = m.stages.filter((n) => STAGES[n - 1].built);
    onSelect(built.find((n) => !builtDone(n)) ?? m.main);
  };

  const moduleKeys = useArrowKeys(MODULES.map((m) => m.n), current.n, (n) => openModule(MODULES[n - 1]), "module-tab");
  const stageIds = current.stages.filter((n) => STAGES[n - 1].built);
  const stageKeys = useArrowKeys(stageIds, selected, onSelect, "tab-stage");

  const live = STAGES.filter((s) => s.built);
  const done = live.filter((s) => s.n <= completed).length;

  return (
    <nav className="module-nav" aria-label="Workflow">
      <div className="module-nav-head">
        <span className="eyebrow">Workflow</span>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${(done / live.length) * 100}%` }} />
        </div>
        <span className="small muted tabular">
          <strong className="text">{done}</strong> / {live.length} stages
        </span>
      </div>

      <div className="module-tabs" role="tablist" aria-label="Modules" ref={moduleKeys.ref} onKeyDown={moduleKeys.onKeyDown}>
        {MODULES.map((m) => {
          const built = m.stages.filter((n) => STAGES[n - 1].built);
          const finished = built.filter(builtDone).length;
          const isOpen = m.n === current.n;
          const state = finished === built.length ? "done" : finished ? "partial" : "todo";
          return (
            <button
              key={m.n}
              type="button"
              role="tab"
              id={`module-tab-${m.n}`}
              aria-selected={isOpen}
              tabIndex={isOpen ? 0 : -1}
              className={`module-tab ${state} ${isOpen ? "open" : ""}`}
              onClick={() => openModule(m)}
            >
              <span className="module-icon">
                {state === "done" ? <Icon name="check" size={15} /> : <Icon name={MODULE_ICON[m.n]} size={15} />}
              </span>
              <span className="module-text">
                <span className="module-name">
                  <b>M{m.n}</b> {m.name}
                </span>
                <span className="module-meta">
                  Stages {m.stages[0]}–{m.stages.at(-1)}, {finished} of {built.length} done
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="stage-pills" role="tablist" aria-label={`${current.name} stages`} ref={stageKeys.ref} onKeyDown={stageKeys.onKeyDown}>
        {current.stages.map((n) => {
          const s = STAGES[n - 1];
          const isSelected = n === selected;
          return (
            <button
              key={n}
              type="button"
              role="tab"
              id={`tab-stage-${n}`}
              aria-selected={isSelected}
              aria-controls={s.built ? `panel-stage-${n}` : undefined}
              tabIndex={isSelected ? 0 : -1}
              disabled={!s.built}
              className={`stage-pill ${builtDone(n) ? "done" : ""}`}
              title={`${s.name} → ${s.output}${s.built ? "" : " (planned)"}`}
              onClick={() => onSelect(n)}
            >
              <span className="stage-pill-dot">
                {runningStage === n ? (
                  <span className="spinner xs" aria-hidden="true" />
                ) : builtDone(n) ? (
                  <Icon name="check" size={11} />
                ) : (
                  n
                )}
              </span>
              {s.name}
              {!s.built && <span className="step-soon">planned</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
