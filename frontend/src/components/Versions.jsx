import Icon from "./Icon";
import { BAND_CLASS } from "./ScorePanel";
import { timeAgo } from "../stages";

const fmt = (n) => (n == null ? "—" : n.toFixed(1));
const STAGE_DATA = ["profile", "literature", "score", "refinement", "plan", "paper"];

// All versions of a project, oldest first. Mirrors backend services/versions_service.load().
export function versionsOf(viewed) {
  const project = viewed.__base || viewed;
  let h = project.history;
  if (Array.isArray(h)) {
    // Legacy rows: a list of compact summaries saved before full snapshots existed
    h = {
      current: h.length + 1,
      current_parent: h.at(-1)?.version ?? null,
      current_label: h.length ? "Refined" : "Original",
      versions: h.map((v, i) => ({ ...v, legacy: true, label: i ? "Refined" : "Original", parent: v.version - 1 || null })),
    };
  }
  h = h || { current: 1, current_parent: null, current_label: "Original", versions: [] };
  const working = {
    version: h.current,
    parent: h.current_parent,
    label: h.current_label,
    title: project.title,
    score: project.score,
    working: true,
  };
  return { current: h.current, list: [...h.versions, working].sort((a, b) => a.version - b.version) };
}

const totalOf = (v) => v?.score?.total;
const llmTotalOf = (v) => v?.score?.llm_score?.total ?? v?.score?.llm_total;

// A stored version shaped like a project, so the normal tabs can display it read-only
export function viewOf(project, number) {
  const v = versionsOf(project).list.find((x) => x.version === number);
  if (!v || v.working) return null;
  return {
    ...project,
    title: v.title,
    idea_text: v.idea_text,
    ...Object.fromEntries(STAGE_DATA.map((k) => [k, v[k] ?? null])),
    __version: v,
    __base: project,
  };
}

// The version being displayed (working or stored) and the one it was derived from
export function shownVersion(project) {
  const { list, current } = versionsOf(project);
  const number = project.__version?.version ?? current;
  const shown = list.find((v) => v.version === number);
  return { number, parent: list.find((v) => v.version === shown?.parent) };
}

export function VersionSwitcher({ project, viewing, onOpen }) {
  const { list, current } = versionsOf(project);
  if (list.length < 2) return null;
  return (
    <label className="version-switcher" title="Open a version. Each version keeps its own analysis, refinement, plan and paper.">
      <Icon name="layers" size={14} />
      <span className="sr-only">Open project version</span>
      <select value={viewing ?? current} onChange={(e) => onOpen(Number(e.target.value))}>
        {[...list].reverse().map((v) => (
          <option key={v.version} value={v.version}>
            v{v.version} · {v.label || "Version"}
            {totalOf(v) != null ? ` · ${fmt(totalOf(v))}` : ""}
            {v.legacy ? " · summary only" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

// Stage 1 tab: every version of the project; any of them can be opened and worked on
export function VersionHistory({ project, viewing, onOpen, busy }) {
  const { list, current } = versionsOf(project);
  if (list.length < 2) return null;
  const shown = viewing ?? current;
  return (
    <div className="versions">
      <h3 className="sub-title">
        <Icon name="layers" size={15} /> Versions of this project
      </h3>
      <p className="small muted">Each version keeps its own analysis, refinement, plan and paper. Open one to continue working on it.</p>
      <ol className="version-list">
        {list.map((v) => (
          <li key={v.version} className={`version ${v.version === shown ? "is-current" : ""}`}>
            <span className="version-tag">v{v.version}</span>
            <div className="version-main">
              <strong>{v.title}</strong>
              <span className="small muted">
                {v.label || "Version"}
                {v.parent ? ` from v${v.parent}` : ""}
                {totalOf(v) != null && (
                  <>
                    {" · ROS "}
                    <span className={BAND_CLASS[v.score.band]}>{fmt(totalOf(v))}</span>
                  </>
                )}
                {v.version === shown ? " · open now" : ""}
                {v.legacy ? " · summary only" : ""}
              </span>
            </div>
            {v.version !== shown && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onOpen(v.version)}>
                {v.legacy ? "View Summary" : "Open"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Banner shown while a summary-only (legacy) version is displayed
export function VersionBanner({ version, onBack }) {
  return (
    <div className="alert alert-warn version-banner" role="status">
      <Icon name="layers" size={16} />
      <div>
        <strong>
          v{version.version} · {version.label}
        </strong>{" "}
        was saved before full version snapshots existed, so only its summary can be shown.
      </div>
      <div className="version-banner-actions">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          Back to the Open Version
        </button>
      </div>
    </div>
  );
}

// Versions saved before full snapshots existed only have a score summary
export function LegacySummary({ version }) {
  return (
    <section className="card vc-card">
      <span className="eyebrow">v{version.version} · summary only</span>
      <h2 className="vc-title">{version.title}</h2>
      <p className="small muted">This version was saved before full version snapshots existed, so only its score summary is available.</p>
      {version.idea_text && <p className="idea-text">{version.idea_text}</p>}
      <div className="table-wrap">
        <table className="compare-table">
          <tbody>
            <tr>
              <th scope="row">Research Opportunity Score</th>
              <td className="num">
                {fmt(version.score.total)} ({version.score.band})
              </td>
            </tr>
            {version.score.dimensions.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.name}</th>
                <td className="num">{fmt(d.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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

// Stage 4 tab: ROS of the parent version vs this one
export function VersionCompare({ project }) {
  const { number: current, parent: prev } = shownVersion(project);
  const score = project.score;
  if (!prev?.score || !score) return null;
  const before = Object.fromEntries(prev.score.dimensions.map((d) => [d.key, d.score]));
  const llmBefore = llmTotalOf(prev);
  const llmNow = score.llm_score?.total;
  return (
    <section className="card vc-card" aria-labelledby="compare-title">
      <header className="vc-head">
        <div>
          <span className="eyebrow">Refinement impact</span>
          <h2 id="compare-title" className="vc-title">
            v{prev.version} → v{current}
          </h2>
          <p className="small muted">Same profile and papers; only the idea changed, so the difference comes from the refinement.</p>
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
                v{current}
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
          {llmBefore != null && llmNow != null && (
            <tfoot>
              <tr>
                <th scope="row">LLM judge total</th>
                <td className="num">{fmt(llmBefore)}</td>
                <td className="num">{fmt(llmNow)}</td>
                <td className="num">
                  <Delta value={llmNow - llmBefore} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export { Delta };
