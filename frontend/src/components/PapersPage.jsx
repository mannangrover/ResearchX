import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import { Alert } from "./common";
import { UploadForm } from "./PaperPanel";
import { timeAgo } from "../stages";

// Upload a paper with no project, and see the analyses done so far.
export default function PapersPage({ papers, onChanged, onOpen }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyse = async ({ filename, content_base64 }) => {
    setBusy(true);
    try {
      const saved = await api.analysePaper({ filename, content_base64 });
      onChanged();
      if (mounted.current) onOpen(saved.id);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const remove = async (paper) => {
    if (!confirm(`Move “${paper.title}” to the trash? You can restore it for 30 days.`)) return;
    await api.deleteProject(paper.id);
    onChanged();
  };

  const list = papers || [];
  return (
    <div className="projects-page">
      <header>
        <h1 className="page-title">Analyse a paper</h1>
        <p className="paper-page-intro">
          Upload a paper to see what it is about, whether it answers its own questions, whether its claims are backed by its
          results, and which published work is closest to it. No project needed.
        </p>
      </header>

      <UploadForm busy={busy} withNote={false} onSubmit={analyse} />
      <p className="small muted paper-privacy">
        The text of your paper is sent to Google Gemini for analysis. Your file is not stored, only the results. Avoid uploading
        anything confidential.
      </p>
      <div aria-live="polite">
        {busy && (
          <Alert kind="info">
            Reading the paper, finding related work and analysing it. This can take a minute or two. You can open other pages
            meanwhile; the result will appear in the list below.
          </Alert>
        )}
      </div>

      <section className="papers-list" aria-labelledby="papers-title">
        <h2 id="papers-title">Your analyses</h2>
        {list.length === 0 ? (
          <p className="small muted">{papers === null ? "Loading…" : "Papers you analyse will appear here."}</p>
        ) : (
          <div className="card projects-table-card">
            <table className="projects-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="th-sort">Paper</span>
                  </th>
                  <th scope="col" className="pt-paper">
                    <span className="th-sort">Score</span>
                  </th>
                  <th scope="col" className="pt-updated">
                    <span className="th-sort">Last analysed</span>
                  </th>
                  <th scope="col" className="pt-delete">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="pt-title">
                      <a href={`#/papers/${p.id}`}>{p.title}</a>
                      {p.domain && (
                        <span className="pt-sub">
                          <span className="tag">{p.domain}</span>
                        </span>
                      )}
                    </td>
                    <td className="pt-num">{p.paper_score == null ? "—" : p.paper_score.toFixed(1)}</td>
                    <td className="pt-time">{timeAgo(p.updated_at)}</td>
                    <td className="pt-delete">
                      <button className="btn btn-icon btn-danger" onClick={() => remove(p)} aria-label={`Move ${p.title} to the trash`} title="Move to trash">
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
