import { useState } from "react";
import Icon from "./Icon";
import { Alert, StageCard } from "./common";

const COMPUTE = [
  ["cpu", "Laptop CPU only"],
  ["single_gpu", "One GPU (e.g. Colab)"],
  ["multi_gpu", "Several GPUs / cluster"],
];
const COMPUTE_LABEL = Object.fromEntries(COMPUTE);

const SECTIONS = [
  ["design", "Design", "target"],
  ["data", "Data & metrics", "database"],
  ["method", "Methodology", "flask"],
  ["timeline", "Timeline", "layers"],
  ["risks", "Risks & resources", "alert"],
];

function OptionsForm({ initial, busy, onSubmit, onCancel }) {
  const [opts, setOpts] = useState(initial);
  const set = (key, num) => (e) => setOpts({ ...opts, [key]: num ? Number(e.target.value) : e.target.value });
  return (
    <form
      className="plan-options"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(opts);
      }}
    >
      <div className="field">
        <label htmlFor="plan-weeks">Time available (weeks)</label>
        <input id="plan-weeks" name="weeks" type="number" inputMode="numeric" min={2} max={52} value={opts.weeks} onChange={set("weeks", true)} />
      </div>
      <div className="field">
        <label htmlFor="plan-team">Team size</label>
        <input id="plan-team" name="team_size" type="number" inputMode="numeric" min={1} max={10} value={opts.team_size} onChange={set("team_size", true)} />
      </div>
      <div className="field">
        <label htmlFor="plan-compute">Compute</label>
        <select id="plan-compute" name="compute" value={opts.compute} onChange={set("compute")}>
          {COMPUTE.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field span-3">
        <label htmlFor="plan-notes">
          Anything else? <span className="muted">(optional)</span>
        </label>
        <input
          id="plan-notes"
          name="notes"
          autoComplete="off"
          value={opts.notes}
          onChange={set("notes")}
          placeholder="e.g. must use a public medical dataset, no paid APIs, deadline before exams…"
        />
      </div>
      <div className="form-actions span-3">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={!!busy}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={!!busy}>
          {busy ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="flask" size={15} />}
          {busy ? "Designing the plan…" : onCancel ? "Regenerate Plan" : "Generate Experiment Plan"}
        </button>
      </div>
    </form>
  );
}

function Design({ plan }) {
  const hyps = plan.hypotheses;
  return (
    <>
      <ol className="hyp-list">
        {hyps.map((h) => (
          <li key={h.id} className="hyp">
            <span className="id-badge">{h.id}</span>
            <p>{h.statement}</p>
            {h.research_question && <span className="chip">{h.research_question}</span>}
          </li>
        ))}
      </ol>

      <h3 className="sub-title">
        <Icon name="flask" size={15} /> Experiments
      </h3>
      <div className="exp-grid">
        {plan.experiments.map((e) => (
          <article key={e.id} className="exp">
            <header>
              <span className="id-badge">{e.id}</span>
              <h4>{e.title}</h4>
            </header>
            {e.purpose && <p className="exp-purpose">{e.purpose}</p>}
            <p className="small">{e.setup}</p>
            <dl className="exp-meta">
              {e.tests.length > 0 && (
                <div>
                  <dt>Tests</dt>
                  <dd>{e.tests.join(", ")}</dd>
                </div>
              )}
              {e.metrics.length > 0 && (
                <div>
                  <dt>Metrics</dt>
                  <dd>{e.metrics.join(", ")}</dd>
                </div>
              )}
              {e.expected_outcome && (
                <div>
                  <dt>Expected</dt>
                  <dd>{e.expected_outcome}</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>

      {hyps.length > 0 && (
        <>
          <h3 className="sub-title">
            <Icon name="check" size={15} /> Traceability: which experiment tests which hypothesis
          </h3>
          <div className="table-wrap">
            <table className="compare-table trace">
              <thead>
                <tr>
                  <th scope="col">Experiment</th>
                  {hyps.map((h) => (
                    <th key={h.id} scope="col" className="num" title={h.statement}>
                      {h.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.experiments.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      {e.id} · {e.title}
                    </th>
                    {hyps.map((h) => (
                      <td key={h.id} className="num">
                        {e.tests.includes(h.id) ? <Icon name="check" size={14} className="ok" label={`${e.id} tests ${h.id}`} /> : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function ItemList({ title, icon, items, render, empty }) {
  return (
    <div className="list-card">
      <h3 className="sub-title">
        <Icon name={icon} size={15} /> {title}
      </h3>
      {items.length ? <ul className="plan-items">{items.map(render)}</ul> : <p className="small muted">{empty}</p>}
    </div>
  );
}

function DataMetrics({ plan }) {
  return (
    <div className="plan-cols">
      <ItemList
        title="Datasets"
        icon="database"
        items={plan.datasets}
        empty="No dataset suggested."
        render={(d) => (
          <li key={d.name}>
            <strong>{d.name}</strong>
            <span>{d.description}</span>
            {d.why && <span className="muted">Why: {d.why}</span>}
            {d.source &&
              (/^https?:\/\//.test(d.source) ? (
                <a href={d.source} target="_blank" rel="noreferrer" className="small">
                  Source <Icon name="external" size={11} />
                </a>
              ) : (
                <span className="small muted">Source: {d.source}</span>
              ))}
          </li>
        )}
      />
      <ItemList
        title="Baselines"
        icon="book"
        items={plan.baselines}
        empty="No baseline suggested."
        render={(b) => (
          <li key={b.name}>
            <strong>{b.name}</strong>
            {b.why && <span>{b.why}</span>}
            {b.source && b.source !== b.name && <span className="small muted">From: {b.source}</span>}
          </li>
        )}
      />
      <ItemList
        title="Metrics"
        icon="gauge"
        items={plan.metrics}
        empty="No metric suggested."
        render={(m) => (
          <li key={m.name}>
            <strong>{m.name}</strong>
            <span>{m.description}</span>
            {m.target && <span className="muted">Target: {m.target}</span>}
          </li>
        )}
      />
      <p className="small muted span-all">
        <Icon name="info" size={12} /> Check that each dataset is available and its licence fits your use before you commit
        to it.
      </p>
    </div>
  );
}

function Methodology({ plan }) {
  return (
    <div className="grid-2">
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="flask" size={15} /> Validity rules
        </h3>
        <ul className="check-list">
          {plan.methodology.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="layers" size={15} /> Ablation study
        </h3>
        <ul className="check-list">
          {plan.ablations.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Timeline({ plan }) {
  const weeks = plan.options.weeks;
  return (
    <div className="gantt" style={{ "--weeks": weeks }}>
      <div className="gantt-scale" aria-hidden="true">
        <span />
        <div className="gantt-weeks">
          {Array.from({ length: weeks }, (_, i) => (
            <span key={i}>{weeks <= 16 || (i + 1) % 2 === 1 ? i + 1 : ""}</span>
          ))}
        </div>
      </div>
      <ol className="gantt-rows">
        {plan.timeline.map((p, i) => (
          <li key={p.phase} className="gantt-row">
            <div className="gantt-label">
              <strong>{p.phase}</strong>
              <span className="small muted">
                {p.start_week === p.end_week ? `Week ${p.start_week}` : `Weeks ${p.start_week}–${p.end_week}`}
              </span>
            </div>
            <div className="gantt-track">
              <span
                className={`gantt-bar c${i % 5}`}
                style={{ gridColumn: `${p.start_week} / ${p.end_week + 1}` }}
                aria-label={`Weeks ${p.start_week} to ${p.end_week}`}
              />
            </div>
            <div className="gantt-detail">
              <ul>
                {p.tasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {p.deliverable && (
                <span className="chip chip-ok">
                  <Icon name="check" size={11} /> {p.deliverable}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Risks({ plan }) {
  const r = plan.resources;
  return (
    <>
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Risk</th>
              <th scope="col">Mitigation</th>
            </tr>
          </thead>
          <tbody>
            {plan.risks.map((x) => (
              <tr key={x.risk}>
                <th scope="row" className="wrap">
                  {x.risk}
                </th>
                <td>{x.mitigation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="cpu" size={15} /> Resources
        </h3>
        <dl className="kv">
          <dt>Compute</dt>
          <dd>{r.compute}</dd>
          {r.estimate && (
            <>
              <dt>Estimate</dt>
              <dd>{r.estimate}</dd>
            </>
          )}
          {r.tools.length > 0 && (
            <>
              <dt>Tools</dt>
              <dd>{r.tools.join(", ")}</dd>
            </>
          )}
        </dl>
      </div>
    </>
  );
}

function toMarkdown(project, plan) {
  const L = [`# Experiment plan — ${project.title}`, "", `**Objective:** ${plan.objective}`, ""];
  L.push(`Constraints: ${plan.options.weeks} weeks · team of ${plan.options.team_size} · ${COMPUTE_LABEL[plan.options.compute]}`, "");
  L.push("## Hypotheses", ...plan.hypotheses.map((h) => `- **${h.id}** (${h.research_question || "—"}): ${h.statement}`), "");
  L.push("## Experiments");
  plan.experiments.forEach((e) => {
    L.push(`### ${e.id}. ${e.title}`, e.purpose, "", e.setup, "");
    if (e.tests.length) L.push(`- Tests: ${e.tests.join(", ")}`);
    if (e.metrics.length) L.push(`- Metrics: ${e.metrics.join(", ")}`);
    if (e.expected_outcome) L.push(`- Expected: ${e.expected_outcome}`);
    L.push("");
  });
  L.push("## Datasets", ...plan.datasets.map((d) => `- **${d.name}** — ${d.description}${d.source ? ` (${d.source})` : ""}`), "");
  L.push("## Baselines", ...plan.baselines.map((b) => `- **${b.name}** — ${b.why}`), "");
  L.push("## Metrics", ...plan.metrics.map((m) => `- **${m.name}** — ${m.description}${m.target ? `. Target: ${m.target}` : ""}`), "");
  L.push("## Methodology", ...plan.methodology.map((m) => `- ${m}`), "", "## Ablations", ...plan.ablations.map((a) => `- ${a}`), "");
  L.push("## Timeline", "| Weeks | Phase | Deliverable |", "|---|---|---|");
  plan.timeline.forEach((p) => L.push(`| ${p.start_week}–${p.end_week} | ${p.phase} | ${p.deliverable} |`));
  L.push("", "## Risks", "| Risk | Mitigation |", "|---|---|", ...plan.risks.map((x) => `| ${x.risk} | ${x.mitigation} |`));
  L.push("", `## Resources`, `- Compute: ${plan.resources.compute}`, `- Tools: ${plan.resources.tools.join(", ")}`);
  if (plan.resources.estimate) L.push(`- Estimate: ${plan.resources.estimate}`);
  L.push("", "_Generated by ResearchX. Decision support only — review every choice before running experiments._");
  return L.join("\n");
}

function download(project, plan) {
  const blob = new Blob([toMarkdown(project, plan)], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-experiment-plan.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PlanPanel({ project, running, disabled, onRun }) {
  const plan = project.plan;
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState("design");
  const refined = project.refinement?.approved || (project.history || []).length > 0;
  const initial = plan?.options || { weeks: 12, team_size: 2, compute: "single_gpu", notes: "" };

  const submit = async (opts) => {
    await onRun(opts);
    setEditing(false);
  };

  if (!plan) {
    return (
      <StageCard
        stage={7}
        title="Experiment planning"
        description="Turns the research questions into testable hypotheses, then designs the datasets, baselines, metrics, experiments, ablations, a timeline that fits your time budget, and the main risks."
      >
        {!refined && (
          <Alert kind="info">
            Tip: refine and approve a proposal in stage 6 first. The plan will then follow your chosen direction and
            constraints instead of the original idea.
          </Alert>
        )}
        <OptionsForm initial={initial} busy={running} onSubmit={submit} />
      </StageCard>
    );
  }

  return (
    <StageCard
      stage={7}
      title="Experiment planning"
      done
      method={plan.method}
      note={plan.note}
      action={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => download(project, plan)}>
            <Icon name="file" size={13} /> Export .md
          </button>
          <button className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            <Icon name="refresh" size={13} /> Regenerate
          </button>
        </>
      }
    >
      {editing && <OptionsForm initial={initial} busy={running} onSubmit={submit} onCancel={() => setEditing(false)} />}

      <div className="plan-summary">
        <p className="plan-objective">{plan.objective}</p>
        <div className="tags">
          <span className="tag">{plan.options.weeks} weeks</span>
          <span className="tag">
            Team of {plan.options.team_size}
          </span>
          <span className="tag">{COMPUTE_LABEL[plan.options.compute]}</span>
          <span className="tag">Based on the {plan.based_on}</span>
        </div>
      </div>

      <div className="subtabs" role="tablist" aria-label="Plan sections">
        {SECTIONS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`plan-tab-${key}`}
            aria-selected={section === key}
            aria-controls="plan-section"
            onClick={() => setSection(key)}
          >
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>
      <div id="plan-section" role="tabpanel" aria-labelledby={`plan-tab-${section}`} className="plan-section">
        {section === "design" && <Design plan={plan} />}
        {section === "data" && <DataMetrics plan={plan} />}
        {section === "method" && <Methodology plan={plan} />}
        {section === "timeline" && <Timeline plan={plan} />}
        {section === "risks" && <Risks plan={plan} />}
      </div>
    </StageCard>
  );
}
