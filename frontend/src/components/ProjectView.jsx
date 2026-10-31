import { useEffect, useState } from "react";
import { api } from "../api";
import { completedStage, timeAgo } from "../stages";
import Icon from "./Icon";
import Stepper from "./Stepper";
import { Alert, StageCard } from "./common";
import ProfilePanel from "./ProfilePanel";
import LiteraturePanel from "./LiteraturePanel";
import ScorePanel, { BAND_CLASS } from "./ScorePanel";
import GapsPanel from "./GapsPanel";
import RefinementPanel from "./RefinementPanel";
import Roadmap from "./Roadmap";

const RUNNING_LABEL = {
  analyze: "Analysing the project and repository…",
  literature: "Searching OpenAlex, Semantic Scholar and arXiv, then ranking papers…",
  score: "Computing the Research Opportunity Score and research gaps…",
};

function Overview({ project }) {
  const { literature, score } = project;
  if (!literature && !score) return null;
  const items = [];
  if (score) {
    items.push({
      label: "Opportunity score",
      value: score.total.toFixed(1),
      unit: "/ 100",
      sub: `${score.band} opportunity`,
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

export default function ProjectView({ id, onChanged, onDeleted, onOpenProject }) {
  const [project, setProject] = useState(null);
  const [running, setRunning] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0 });
    api.getProject(id).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  const run = async (step, fn) => {
    setRunning(step);
    setError("");
    try {
      setProject(await fn());
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(null);
    }
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

  const available = [1, project.profile && 2, project.profile && 3, project.literature && 4, project.score && 5, project.score && 6].filter(Boolean);

  return (
    <div className="project-view">
      <header className="page-head project-head">
        <div className="project-head-main">
          <span className="eyebrow">
            {project.domain || "Domain not set"}
            {project.created_at && ` · created ${timeAgo(project.created_at)}`}
          </span>
          <h1>{project.title}</h1>
          {project.github_url && (
            <a className="repo-link" href={project.github_url} target="_blank" rel="noreferrer">
              <Icon name="github" size={14} />
              {project.github_url.replace("https://github.com/", "")}
              <Icon name="external" size={12} />
            </a>
          )}
        </div>
        <button className="btn btn-ghost btn-danger" onClick={remove}>
          <Icon name="trash" size={15} /> Delete
        </button>
      </header>

      <Overview project={project} />
      <Stepper completed={completedStage(project)} available={available} />

      <div className="run-status" aria-live="polite">
        {running && (
          <div className="alert alert-info running">
            <span className="spinner sm" aria-hidden="true" />
            <div>{RUNNING_LABEL[running]}</div>
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
      </div>

      <StageCard stage={1} title="Research idea" done>
        {project.idea_text ? (
          <p className="idea-text">{project.idea_text}</p>
        ) : (
          <p className="muted">No written idea — this project is analysed from its GitHub repository.</p>
        )}
      </StageCard>

      <ProfilePanel
        data={project.profile}
        running={running === "analyze"}
        disabled={!!running}
        onRun={() => run("analyze", () => api.analyze(id))}
      />

      {project.profile && (
        <LiteraturePanel
          data={project.literature}
          defaultQueries={project.profile.profile.search_queries}
          running={running === "literature"}
          disabled={!!running}
          onRun={(queries) => run("literature", () => api.literature(id, queries))}
        />
      )}

      {project.literature && (
        <ScorePanel
          data={project.score}
          running={running === "score"}
          disabled={!!running}
          onRun={() => run("score", () => api.score(id))}
        />
      )}

      {project.score && <GapsPanel data={project.score} />}

      {project.score && (
        <RefinementPanel
          project={project}
          api={api}
          disabled={!!running}
          onUpdated={(p) => {
            setProject(p);
            onChanged();
          }}
          onOpenProject={onOpenProject}
        />
      )}

      <Roadmap />
    </div>
  );
}
