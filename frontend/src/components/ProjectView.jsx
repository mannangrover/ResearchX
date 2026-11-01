import { useEffect, useState } from "react";
import { api } from "../api";
import { STAGES, completedStage, timeAgo } from "../stages";
import Icon from "./Icon";
import Stepper from "./Stepper";
import { Alert, StageCard } from "./common";
import ProfilePanel from "./ProfilePanel";
import LiteraturePanel from "./LiteraturePanel";
import ScorePanel, { BAND_CLASS } from "./ScorePanel";
import GapsPanel from "./GapsPanel";
import RefinementPanel from "./RefinementPanel";
import PlanPanel from "./PlanPanel";
import PaperPanel from "./PaperPanel";
import GuidancePanel from "./GuidancePanel";
import { LegacySummary, VersionBanner, VersionCompare, VersionHistory, VersionSwitcher, shownVersion, versionsOf, viewOf } from "./Versions";

const STEPS = {
  apply: { stage: 4, label: "Creating the refined version: re-computing the Research Opportunity Score (profile and papers are reused)…" },
  switch: { stage: 1, label: "Opening the version…" },
  analyze: { stage: 2, label: "Analysing the project and repository…" },
  literature: { stage: 3, label: "Searching OpenAlex, Semantic Scholar and arXiv, then ranking papers…" },
  score: { stage: 4, label: "Computing the Research Opportunity Score and research gaps…" },
  plan: { stage: 7, label: "Designing the experiment plan…" },
  paper: { stage: 8, label: "Reading and analysing the paper…" },
  guidance: { stage: 10, label: "Assessing publication readiness…" },
};

// Which tab to open first: the next thing to do, or the headline result
function defaultTab(project) {
  if (!project.profile) return 2;
  if (!project.literature) return 3;
  if (!project.score) return 4;
  if (project.guidance || project.paper?.analysis) return 10;
  if (project.plan) return 8;
  if (project.refinement?.approved) return 7;
  return 4;
}

function Overview({ project }) {
  const { literature, score } = project;
  if (!literature && !score) return null;
  const items = [];
  if (score) {
    const { parent } = shownVersion(project);
    const prev = parent?.score?.total;
    const delta = prev == null ? null : score.total - prev;
    items.push({
      label: "Opportunity score",
      value: score.total.toFixed(1),
      unit: "/ 100",
      sub:
        delta == null
          ? `${score.band} opportunity`
          : `${score.band} · ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} vs v${parent.version}`,
      cls: BAND_CLASS[score.band],
    });
    if (score.llm_score) {
      items.push({
        label: "LLM judge",
        value: score.llm_score.total.toFixed(1),
        unit: "/ 100",
        sub: score.comparison?.agreement || score.llm_score.band,
      });
    }
  }
  if (literature) {
    items.push({ label: "Papers analysed", value: literature.stats.total, sub: `top ${literature.papers.length} ranked` });
  }
  if (score) items.push({ label: "Research gaps", value: score.gaps.length, sub: `${score.research_questions.length} research questions` });
  return (
    <dl className="kpis">
      {items.map((k) => (
        <div key={k.label} className="kpi">
          <dt>{k.label}</dt>
          <dd>
            <span className={`kpi-value ${k.cls || ""}`}>{k.value}</span>
            {k.unit && <span className="kpi-unit">{k.unit}</span>}
          </dd>
          <dd className="kpi-sub">{k.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

function Prerequisite({ stage, needs, onGo }) {
  const s = STAGES[stage - 1];
  const n = STAGES[needs - 1];
  return (
    <StageCard stage={stage} title={s.name} description={`Produces: ${s.output}.`}>
      <div className="empty-state">
        <Icon name="info" size={18} />
        <p>
          Complete <strong>stage {needs} · {n.name}</strong> first. This stage builds on its results.
        </p>
        <button className="btn btn-secondary" onClick={() => onGo(needs)}>
          Go to {n.short} <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </StageCard>
  );
}

export default function ProjectView({ id, onChanged, onDeleted }) {
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState(null);
  const [viewing, setViewing] = useState(null); // number of a stored version being viewed, or null
  const [running, setRunning] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0 });
    api
      .getProject(id)
      .then((p) => {
        setProject(p);
        setTab(defaultTab(p));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const selectTab = (n) => {
    setTab(n);
    document.getElementById("stage-tabs")?.scrollIntoView({ block: "nearest" });
  };

  // Run one stage; switches to its tab so the user sees the result. Returns false on failure.
  const run = async (step, fn) => {
    setRunning(step);
    setError("");
    setTab(STEPS[step].stage);
    try {
      setProject(await fn());
      onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setRunning(null);
    }
  };

  const applyRefinement = async () => {
    const next = Math.max(...versionsOf(project).list.map((v) => v.version)) + 1;
    if (!confirm(`Create v${next} from the approved proposal? The current version stays in this project and can be opened again from the version menu.`)) return;
    await run("apply", () => api.refineApply(id));
  };

  // Opening a version makes it the one you work on; the previously open version is stored intact
  const openVersion = async (n) => {
    setError("");
    const { list, current } = versionsOf(project);
    if (n === current) return setViewing(null);
    const target = list.find((v) => v.version === n);
    if (target?.legacy) return setViewing(n); // summary only — can be shown, not opened
    setViewing(null);
    await run("switch", () => api.switchVersion(id, n));
  };

  const remove = async () => {
    if (!confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
    await api.deleteProject(id);
    onDeleted();
  };

  if (!project) {
    return error ? (
      <Alert kind="error">{error}</Alert>
    ) : (
      <div className="skeleton-page" aria-busy="true" aria-label="Loading project">
        <span className="skeleton h-title" />
        <span className="skeleton h-card" />
        <span className="skeleton h-card" />
      </div>
    );
  }

  // Only summary-only (legacy) versions are shown read-only; every other version is opened for real
  const shown = (viewing != null && viewOf(project, viewing)) || project;
  const stored = shown.__version;
  const readOnly = !!stored;
  const available = STAGES.filter((s) => s.built).map((s) => s.n);
  const { current } = versionsOf(project);
  const busy = !!running || readOnly;

  // Tab content. Stages whose input is missing show a pointer to the prerequisite instead.
  const panels = {
    1: (
      <StageCard stage={1} title="Research idea" done>
        {shown.idea_text ? (
          <p className="idea-text">{shown.idea_text}</p>
        ) : (
          <p className="muted">No written idea — this project is analysed from its GitHub repository.</p>
        )}
        <VersionHistory project={shown} viewing={viewing} onOpen={openVersion} busy={!!running} />
      </StageCard>
    ),
    2: (
      <ProfilePanel data={shown.profile} running={running === "analyze"} disabled={busy} onRun={() => run("analyze", () => api.analyze(id))} />
    ),
    3: shown.profile ? (
      <LiteraturePanel
        data={shown.literature}
        defaultQueries={shown.profile.profile.search_queries}
        running={running === "literature"}
        disabled={busy}
        onRun={(queries) => run("literature", () => api.literature(id, queries))}
      />
    ) : (
      <Prerequisite stage={3} needs={2} onGo={selectTab} />
    ),
    4: shown.literature ? (
      <>
        <VersionCompare project={shown} />
        <ScorePanel data={shown.score} running={running === "score"} disabled={busy} onRun={() => run("score", () => api.score(id))} />
      </>
    ) : (
      <Prerequisite stage={4} needs={shown.profile ? 3 : 2} onGo={selectTab} />
    ),
    5: shown.score ? <GapsPanel data={shown.score} /> : <Prerequisite stage={5} needs={4} onGo={selectTab} />,
    6: shown.score ? (
      <RefinementPanel
        project={shown}
        api={api}
        disabled={busy}
        onUpdated={(p) => {
          setProject(p);
          onChanged();
        }}
        onApply={applyRefinement}
      />
    ) : (
      <Prerequisite stage={6} needs={4} onGo={selectTab} />
    ),
    7: shown.score ? (
      <PlanPanel project={shown} running={running === "plan"} disabled={busy} onRun={(opts) => run("plan", () => api.plan(id, opts))} />
    ) : (
      <Prerequisite stage={7} needs={4} onGo={selectTab} />
    ),
    8: shown.score ? (
      <PaperPanel project={shown} running={running === "paper"} disabled={busy} onRun={(body) => run("paper", () => api.paper(id, body))} />
    ) : (
      <Prerequisite stage={8} needs={shown.literature ? 4 : shown.profile ? 3 : 2} onGo={selectTab} />
    ),
    10: shown.paper?.analysis ? (
      <GuidancePanel project={shown} running={running === "guidance"} disabled={busy} onRun={() => run("guidance", () => api.guidance(id))} />
    ) : (
      <Prerequisite stage={10} needs={shown.score ? 8 : 4} onGo={selectTab} />
    ),
  };

  const idx = available.indexOf(tab);
  const prev = STAGES[available[idx - 1] - 1];
  const next = STAGES[available[idx + 1] - 1];

  return (
    <div className="project-view">
      <header className="page-head project-head">
        <div className="project-head-main">
          <span className="eyebrow">
            {project.domain || "Domain not set"}
            {project.created_at && ` · created ${timeAgo(project.created_at)}`}
          </span>
          <h1>{shown.title}</h1>
          {project.github_url && (
            <a className="repo-link" href={project.github_url} target="_blank" rel="noreferrer">
              <Icon name="github" size={14} />
              {project.github_url.replace("https://github.com/", "")}
              <Icon name="external" size={12} />
            </a>
          )}
        </div>
        <div className="project-head-actions">
          <VersionSwitcher project={project} viewing={viewing} onOpen={openVersion} />
          <button className="btn btn-ghost btn-danger" onClick={remove} disabled={!!running}>
            <Icon name="trash" size={15} /> Delete
          </button>
        </div>
      </header>

      {stored && <VersionBanner version={stored} onBack={() => setViewing(null)} />}

      {!stored?.legacy && <Overview project={shown} />}

      <div className="stage-tabs" id="stage-tabs">
        <Stepper
          completed={completedStage(shown)}
          available={available}
          selected={tab}
          onSelect={selectTab}
          runningStage={running && STEPS[running].stage}
        />
      </div>

      <div className="run-status" aria-live="polite">
        {running && (
          <div className="alert alert-info running">
            <span className="spinner sm" aria-hidden="true" />
            <div>{STEPS[running].label}</div>
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
      </div>

      <div
        className={`tab-panel ${readOnly ? "readonly" : ""}`}
        role="tabpanel"
        id={`panel-stage-${tab}`}
        aria-labelledby={`tab-stage-${tab}`}
        key={`${tab}-${viewing}`}
      >
        {stored?.legacy ? <LegacySummary version={stored} /> : panels[tab]}
      </div>

      <nav className="tab-pager" aria-label="Stage navigation">
        {prev ? (
          <button className="btn btn-ghost" onClick={() => selectTab(prev.n)}>
            <Icon name="arrowRight" size={14} className="flip" /> {prev.n}. {prev.short}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button className="btn btn-secondary" onClick={() => selectTab(next.n)}>
            Next: {next.n}. {next.name} <Icon name="arrowRight" size={14} />
          </button>
        )}
      </nav>
    </div>
  );
}
