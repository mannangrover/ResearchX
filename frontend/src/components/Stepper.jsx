import Icon from "./Icon";
import { BUILT_STAGES, STAGES } from "../stages";

// Pipeline overview. Stages that have a section on the page link to it.
export default function Stepper({ completed, available }) {
  return (
    <nav className="card stepper-card" aria-label="Workflow progress">
      <div className="stepper-head">
        <span className="eyebrow">Workflow progress</span>
        <span className="small muted">
          <strong className="text">{completed}</strong> of {BUILT_STAGES} live stages complete · {STAGES.length - BUILT_STAGES}{" "}
          planned
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(completed / STAGES.length) * 100}%` }} />
      </div>
      <ol className="stepper">
        {STAGES.map((s) => {
          const state = s.n <= completed ? "done" : s.n === completed + 1 && s.built ? "current" : s.built ? "todo" : "locked";
          const content = (
            <>
              <span className="step-dot">{state === "done" ? <Icon name="check" size={13} /> : s.n}</span>
              <span className="step-name">{s.short}</span>
            </>
          );
          return (
            <li key={s.n} className={`step ${state}`} title={`${s.name} → ${s.output}${s.built ? "" : " (planned)"}`}>
              {available.includes(s.n) ? (
                <a href={`#stage-${s.n}`} aria-current={state === "current" ? "step" : undefined}>
                  {content}
                </a>
              ) : (
                <span className="step-static">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
