import Icon from "./Icon";
import { STAGES } from "../stages";

export default function Roadmap() {
  return (
    <section className="roadmap" aria-labelledby="roadmap-title">
      <div className="section-head">
        <h2 id="roadmap-title">Planned stages</h2>
        <span className="small muted">Next milestones from the SRS</span>
      </div>
      <ol className="roadmap-grid">
        {STAGES.filter((s) => !s.built).map((s) => (
          <li key={s.n} className="roadmap-item">
            <span className="roadmap-icon">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="eyebrow">Stage {s.n}</span>
            <strong>{s.name}</strong>
            <span className="small muted">{s.output}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
