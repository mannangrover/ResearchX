import Icon from "./Icon";
import { BAND_CLASS } from "./ScorePanel";
import { timeAgo } from "../stages";

const fmt = (n) => (n == null ? "—" : n.toFixed(1));

function Delta({ value, digits = 1 }) {
  if (value == null) return <span className="muted">—</span>;
  const rounded = Number(value.toFixed(digits));
  const cls = rounded > 0 ? "delta-up" : rounded < 0 ? "delta-down" : "delta-flat";
  return (
    <span className={`delta ${cls}`}>
      {rounded > 0 ? "+" : rounded < 0 ? "−" : "±"}
      {Math.abs(rounded).toFixed(digits)}
    </span>
  );
}

// Stage 1 tab: every version this project has gone through (oldest first, current last)
export function VersionHistory({ project }) {
  const history = project.history || [];
  if (!history.length) return null;
  const current = history.length + 1;
  return (
    <div className="versions">
      <h3 className="sub-title">
        <Icon name="layers" size={15} /> Version history
      </h3>
      <ol className="version-list">
        {history.map((v) => (
          <li key={v.version} className="version">
            <span className="version-tag">v{v.version}</span>
            <div className="version-main">
              <strong>{v.title}</strong>
              <span className="small muted">
                Scored{" "}
                <span className={BAND_CLASS[v.score.band]}>
                  {fmt(v.score.total)}/100 ({v.score.band})
                </span>{" "}
                · {v.papers} papers · {v.gaps} gaps · replaced {timeAgo(v.replaced_at)}
              </span>
              <details className="disclosure">
                <summary>What changed in v{v.version + 1}</summary>
                {v.proposal?.changes_from_original?.length ? (
                  <ul className="check-list">
                    {v.proposal.changes_from_original.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">No change list was recorded.</p>
                )}
                <p className="small muted version-idea">
                  <strong>Original text:</strong> {v.idea_text || "(GitHub repository only)"}
                </p>
              </details>
            </div>
          </li>
        ))}
        <li className="version is-current">
          <span className="version-tag">v{current}</span>
          <div className="version-main">
            <strong>{project.title}</strong>
            <span className="small muted">
              Current version
              {project.score ? ` · scored ${fmt(project.score.total)}/100` : " · re-analysis in progress or pending"}
            </span>
          </div>
        </li>
      </ol>
    </div>
  );
}

// Stage 4 tab: score of the previous version vs the current one
export function VersionCompare({ project }) {
  const prev = (project.history || []).at(-1);
  const score = project.score;
  if (!prev || !score) return null;
  const before = Object.fromEntries(prev.score.dimensions.map((d) => [d.key, d.score]));
  const llmNow = score.llm_score?.total;
  return (
    <section className="card vc-card" aria-labelledby="compare-title">
      <header className="vc-head">
        <div>
          <span className="eyebrow">Refinement impact</span>
          <h2 id="compare-title">
            v{prev.version} → v{prev.version + 1}
          </h2>
          <p className="small muted">Same scoring method, re-run on the refined idea with a fresh literature search.</p>
        </div>
        <div className="vc-totals">
          <div>
            <span className="small muted">Before</span>
            <strong className={BAND_CLASS[prev.score.band]}>{fmt(prev.score.total)}</strong>
          </div>
          <Icon name="arrowRight" size={18} />
          <div>
            <span className="small muted">After</span>
            <strong className={BAND_CLASS[score.band]}>{fmt(score.total)}</strong>
          </div>
          <Delta value={score.total - prev.score.total} />
        </div>
      </header>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="num">
                v{prev.version}
              </th>
              <th scope="col" className="num">
                v{prev.version + 1}
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {score.dimensions.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.name}</th>
                <td className="num">{fmt(before[d.key])}</td>
                <td className="num">{fmt(d.score)}</td>
                <td className="num">
                  <Delta value={before[d.key] == null ? null : d.score - before[d.key]} />
                </td>
              </tr>
            ))}
          </tbody>
          {prev.score.llm_total != null && llmNow != null && (
            <tfoot>
              <tr>
                <th scope="row">LLM judge total</th>
                <td className="num">{fmt(prev.score.llm_total)}</td>
                <td className="num">{fmt(llmNow)}</td>
                <td className="num">
                  <Delta value={llmNow - prev.score.llm_total} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export function previousTotal(project) {
  return (project.history || []).at(-1)?.score.total;
}
