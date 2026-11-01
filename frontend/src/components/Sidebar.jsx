import Icon from "./Icon";
import { BUILT_STAGES, STAGES } from "../stages";
import { FILTERS } from "./ProjectsPage";

const FILTER_ICON = { all: "folder", progress: "refresh", done: "check" };

// Overleaf-style navigation: new project, status filters and domains (like tags).
export default function Sidebar({ projects, trashCount, filter, onFilter, onNew, view }) {
  const list = projects || [];
  const domains = Object.entries(
    list.reduce((acc, p) => {
      if (p.domain) acc[p.domain] = (acc[p.domain] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const onList = view === "list";

  return (
    <aside className="sidebar" aria-label="Projects navigation">
      <button className={`btn btn-primary btn-block ${view === "new" ? "is-current" : ""}`} onClick={onNew}>
        <Icon name="plus" size={16} /> New Project
      </button>

      <nav className="sidebar-section" aria-label="Project filters">
        <ul className="side-nav">
          {Object.entries(FILTERS).map(([key, f]) => {
            const active = onList && filter.status === key && !filter.domain;
            return (
              <li key={key}>
                <button className={`side-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => onFilter({ status: key, domain: null })}>
                  <Icon name={FILTER_ICON[key]} size={15} />
                  <span>{f.label}</span>
                  {projects && <span className="count">{list.filter(f.test).length}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {domains.length > 0 && (
          <>
            <h2 className="sidebar-title">Domains</h2>
            <ul className="side-nav">
              {domains.map(([d, n]) => {
                const active = onList && filter.domain === d;
                return (
                  <li key={d}>
                    <button className={`side-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => onFilter({ status: "all", domain: d })}>
                      <span className="domain-dot" aria-hidden="true" />
                      <span>{d}</span>
                      <span className="count">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <ul className="side-nav side-nav-bottom">
        <li>
          <a className={`side-link ${view === "trash" ? "active" : ""}`} href="#/trash" aria-current={view === "trash" ? "page" : undefined}>
            <Icon name="trash" size={15} />
            <span>Trash</span>
            {trashCount > 0 && <span className="count">{trashCount}</span>}
          </a>
        </li>
        <li>
          <a className={`side-link ${view === "account" ? "active" : ""}`} href="#/account" aria-current={view === "account" ? "page" : undefined}>
            <Icon name="users" size={15} />
            <span>Account</span>
          </a>
        </li>
      </ul>

      <div className="sidebar-foot">
        <span className="status-dot ok" aria-hidden="true" />
        {BUILT_STAGES} of {STAGES.length} stages live
      </div>
    </aside>
  );
}
