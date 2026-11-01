import { useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import { Alert } from "./common";
import { timeAgo } from "../stages";

const TRASH_DAYS = 30;

function daysLeft(deletedAt) {
  const left = TRASH_DAYS - (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(left));
}

export default function TrashPage({ trash, onChanged }) {
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const rows = [...(trash || [])].sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
  const allChecked = rows.length > 0 && rows.every((p) => selected.has(p.id));

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const act = async (kind, ids) => {
    if (kind === "forever" && !confirm(`Permanently delete ${ids.length} project${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBusy(kind);
    setError("");
    try {
      await Promise.all(ids.map((id) => (kind === "restore" ? api.restoreProject(id) : api.deleteForever(id))));
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="projects-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">All projects</a>
        <Icon name="chevronRight" size={13} />
        <span aria-current="page">Trash</span>
      </nav>
      <header className="projects-head">
        <div>
          <h1>Trash</h1>
          <p className="small muted">Projects in the trash are deleted permanently after {TRASH_DAYS} days. Restore them to keep working.</p>
        </div>
        {rows.length > 0 && (
          <button className="btn btn-secondary btn-danger" disabled={!!busy} onClick={() => act("forever", rows.map((p) => p.id))}>
            <Icon name="trash" size={15} /> Empty Trash
          </button>
        )}
      </header>

      {error && <Alert kind="error">{error}</Alert>}
      {selected.size > 0 && (
        <div className="projects-tools">
          <div className="selection-bar" role="status">
            <span>
              <strong>{selected.size}</strong> selected
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act("restore", [...selected])}>
              <Icon name="refresh" size={13} /> Restore
            </button>
            <button className="btn btn-secondary btn-danger btn-sm" disabled={!!busy} onClick={() => act("forever", [...selected])}>
              <Icon name="trash" size={13} /> Delete Forever
            </button>
          </div>
        </div>
      )}

      <div className="card projects-table-card">
        {trash === null ? (
          <div className="skeleton-list" aria-busy="true" aria-label="Loading">
            <span className="skeleton" />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <Icon name="trash" size={22} />
            <p>The trash is empty.</p>
          </div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th scope="col" className="pt-check">
                  <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((p) => p.id)))} aria-label="Select all" />
                </th>
                <th scope="col">
                  <span className="th-sort">Title</span>
                </th>
                <th scope="col" className="pt-updated">
                  <span className="th-sort">Moved to trash</span>
                </th>
                <th scope="col" className="pt-ros">
                  <span className="th-sort">Deleted in</span>
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? "is-selected" : ""}>
                  <td className="pt-check">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
                  </td>
                  <td className="pt-title">
                    <span className="pt-trash-title">{p.title}</span>
                    <span className="pt-sub">{p.domain && <span className="tag">{p.domain}</span>}</span>
                  </td>
                  <td className="pt-time">{timeAgo(p.deleted_at)}</td>
                  <td className="pt-num">{daysLeft(p.deleted_at)} days</td>
                  <td className="pt-actions">
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act("restore", [p.id])}>
                      <Icon name="refresh" size={13} /> Restore
                    </button>
                    <button className="btn btn-icon btn-danger" disabled={!!busy} onClick={() => act("forever", [p.id])} aria-label={`Delete ${p.title} forever`} title="Delete forever">
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
