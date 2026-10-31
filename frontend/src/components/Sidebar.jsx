import { useState } from "react";
import Icon from "./Icon";
import { BUILT_STAGES, STAGES, listStage, timeAgo } from "../stages";

function ProjectItem({ project, active, onSelect }) {
  const stage = listStage(project.stage);
  return (
    <li>
      <button className={`project-item ${active ? "active" : ""}`} onClick={() => onSelect(project.id)} aria-current={active ? "page" : undefined}>
        <span className="project-title">{project.title}</span>
        <span className="project-meta">
          <span className="mini-progress" aria-hidden="true">
            <span style={{ width: `${(stage / STAGES.length) * 100}%` }} />
          </span>
          <span>
            Stage {stage}/{STAGES.length}
          </span>
          {project.github_url && <Icon name="github" size={12} label="Has GitHub repository" />}
          <span className="project-time">{timeAgo(project.updated_at)}</span>
        </span>
      </button>
    </li>
  );
}

export default function Sidebar({ projects, selectedId, onSelect, onNew }) {
  const [query, setQuery] = useState("");
  const list = projects || [];
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((p) => `${p.title} ${p.domain || ""}`.toLowerCase().includes(q)) : list;

  return (
    <aside className="sidebar" aria-label="Projects">
      <button className={`btn btn-primary btn-block ${selectedId ? "" : "is-current"}`} onClick={onNew}>
        <Icon name="plus" size={16} /> New project
      </button>

      {list.length > 4 && (
        <label className="search">
          <Icon name="search" size={14} />
          <input
            type="search"
            name="project-search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter projects…"
            aria-label="Filter projects"
          />
        </label>
      )}

      <div className="sidebar-section">
        <h2 className="sidebar-title">
          Projects {projects && <span className="count">{list.length}</span>}
        </h2>
        {projects === null ? (
          <div className="skeleton-list" aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="sidebar-empty">
            <Icon name="folder" size={20} />
            <p>No projects yet. Create one or load an example to get started.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="muted small sidebar-pad">No projects match “{query}”.</p>
        ) : (
          <ul className="project-list">
            {shown.map((p) => (
              <ProjectItem key={p.id} project={p} active={p.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-foot">
        <span className="status-dot ok" aria-hidden="true" />
        Stages 1–{BUILT_STAGES} of {STAGES.length} live
      </div>
    </aside>
  );
}
