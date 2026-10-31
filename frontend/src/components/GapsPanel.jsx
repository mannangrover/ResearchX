import Icon from "./Icon";
import { StageCard } from "./common";

export default function GapsPanel({ data }) {
  return (
    <StageCard stage={5} title="Research gaps & directions" done method={data.method} note={data.note}>
      {data.gaps.length === 0 ? (
        <p className="muted">No specific gaps were detected from the available evidence.</p>
      ) : (
        <ol className="gaps">
          {data.gaps.map((g, i) => (
            <li key={g.title} className="gap">
              <span className="gap-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{g.title}</h3>
              <p>{g.description}</p>
              {g.evidence && (
                <p className="gap-evidence">
                  <strong>Evidence</strong> {g.evidence}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="grid-2 gaps-lists">
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="refresh" size={15} /> Suggested modifications
          </h3>
          {data.modifications.length ? (
            <ul className="check-list">
              {data.modifications.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None — the project already scores well on every dimension.</p>
          )}
        </div>
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="lightbulb" size={15} /> Candidate research questions
          </h3>
          <ol className="rq-list">
            {data.research_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      </div>
    </StageCard>
  );
}
