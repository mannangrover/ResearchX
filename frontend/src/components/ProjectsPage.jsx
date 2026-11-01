import { useMemo, useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import { Alert } from "./common";
import { MODULES, STAGES, listStage, timeAgo } from "../stages";

const LIVE = STAGES.filter((s) => s.built);
const fmt = (n) => (n == null ? "—" : n.toFixed(1));

export const FILTERS = {
  all: { label: "All projects", test: () => true },
  progress: { label: "In progress", test: (p) => listStage(p.stage) < 10 },
  done: { label: "Completed", test: (p) => listStage(p.stage) >= 10 },
};

const COLUMNS = [
  ["title", "Title", (p) => p.title.toLowerCase()],
  ["progress", "Progress", (p) => listStage(p.stage)],
  ["ros", "Opportunity", (p) => p.ros ?? -1],
  ["paper", "Paper", (p) => p.paper_score ?? -1],
  ["updated", "Last modified", (p) => p.updated_at],
];

function Progress({ stage }) {
  const done = LIVE.filter((s) => s.n <= stage).length;
  const next = LIVE.find((s) => s.n > stage);
  const module = MODULES.find((m) => m.stages.includes(next?.n ?? 10));
  return (
    <div className="pt-progress">
      <span className="pt-progress-label">
        {next ? (
          <>
            <b>M{module.n}</b> {next.short}
          </>
        ) : (
          <>
            <Icon name="check" size={12} /> Complete
          </>
        )}
      </span>
      <span className="mini-progress" aria-hidden="true">
        <span style={{ width: `${(done / LIVE.length) * 100}%` }} />
      </span>
      <span className="sr-only">
        {done} of {LIVE.length} stages complete
      </span>
    </div>
  );
}

export default function ProjectsPage({ projects, filter, onOpen, onNew, onDeleted, error }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "updated", desc: true });
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const list = projects || [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS[filter.status]?.test || FILTERS.all.test;
    const key = COLUMNS.find((c) => c[0] === sort.key)[2];
    return list
      .filter((p) => test(p) && (!filter.domain || p.domain === filter.domain))
      .filter((p) => !q || `${p.title} ${p.domain || ""}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
      });
  }, [list, query, sort, filter]);

  const allChecked = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((p) => p.id)));

  const removeSelected = async () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} project${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => api.deleteProject(id)));
      setSelected(new Set());
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const title = filter.domain || FILTERS[filter.status]?.label || "All projects";
  const sortBy = (key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "updated" || key === "ros" || key === "paper" }));

  return (
    <div className="projects-page">
      <header className="projects-head">
        <h1>{title}</h1>
        <button className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={16} /> New Project
        </button>
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="projects-tools">
        <label className="search projects-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            name="project-search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in all projects…"
            aria-label="Search projects"
          />
        </label>
        {selected.size > 0 && (
          <div className="selection-bar" role="status">
            <span>
              <strong>{selected.size}</strong> selected
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn btn-danger btn-sm btn-secondary" disabled={deleting} onClick={removeSelected}>
              <Icon name="trash" size={13} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>

      <div className="card projects-table-card">
        {projects === null ? (
          <div className="skeleton-list" aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <Icon name="folder" size={22} />
            <p>No projects yet. Create your first one; examples are available on the next page.</p>
            <button className="btn btn-primary" onClick={onNew}>
              <Icon name="plus" size={15} /> New Project
            </button>
          </div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th scope="col" className="pt-check">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all projects" />
                </th>
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key}
                    scope="col"
                    className={`pt-${key}`}
                    aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
                  >
                    <button type="button" className="th-sort" onClick={() => sortBy(key)}>
                      {label}
                      {sort.key === key && <Icon name="chevronDown" size={13} className={sort.desc ? "" : "flip-y"} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? "is-selected" : ""}>
                  <td className="pt-check">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
                  </td>
                  <td className="pt-title">
                    <a
                      href={`#/project/${p.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpen(p.id);
                      }}
                    >
                      {p.title}
                    </a>
                    <span className="pt-sub">
                      {p.domain && <span className="tag">{p.domain}</span>}
                      {p.github_url && <Icon name="github" size={13} label="Has a GitHub repository" />}
                      {p.version > 1 && <span className="pt-version">v{p.version}</span>}
                    </span>
                  </td>
                  <td className="pt-progress-cell">
                    <Progress stage={listStage(p.stage)} />
                  </td>
                  <td className="pt-num">{fmt(p.ros)}</td>
                  <td className="pt-num">
                    {fmt(p.paper_score)}
                    {p.tier && <span className="pt-tier">{p.tier.replace(" venue", "")}</span>}
                  </td>
                  <td className="pt-time">{timeAgo(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {projects !== null && list.length > 0 && rows.length === 0 && <p className="muted small pt-none">No projects match.</p>}
      </div>
      {list.length > 0 && (
        <p className="small muted pt-count">
          Showing {rows.length} of {list.length} project{list.length > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
