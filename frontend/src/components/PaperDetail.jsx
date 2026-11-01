import { useEffect, useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import { Alert, MethodChip, Tags } from "./common";
import { Analysis, BAND_CLASS, Checks, Quality, UploadForm, analysisCounts, qualityBand, ratio } from "./PaperPanel";

const SECTIONS = [
  ["about", "About this paper", "file"],
  ["analysis", "Paper analysis", "search"],
  ["score", "Score & fixes", "gauge"],
  ["related", "Related work", "book"],
  ["checks", "Checks", "check"],
];

const closeness = (s) => (s >= 0.8 ? "almost the same topic" : s >= 0.6 ? "closely related" : s >= 0.5 ? "related" : "loosely related");

function About({ about }) {
  const facts = [
    ["Problem", about.problem],
    ["Method", about.method],
    ["Data", about.data],
  ].filter(([, text]) => text);
  return (
    <>
      <p className="paper-summary">{about.summary}</p>
      {facts.length > 0 && (
        <div className="about-grid">
          {facts.map(([label, text]) => (
            <div key={label}>
              <h3>{label}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      )}
      {about.findings.length > 0 && (
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="lightbulb" size={15} /> Main findings
          </h3>
          <ul className="check-list">
            {about.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {about.keywords.length > 0 && <Tags items={about.keywords} />}
    </>
  );
}

function Related({ paper }) {
  const { papers: rows, errors } = paper.related;
  if (!rows.length) {
    return (
      <Alert kind="warn">
        Related papers could not be found right now{errors.length ? ` (${errors.join("; ")})` : ""}. Upload the paper again later to
        retry.
      </Alert>
    );
  }
  return (
    <>
      <p className="paper-summary">
        The closest published paper is {closeness(rows[0].similarity)} (similarity {rows[0].similarity.toFixed(2)}). The paper
        cites {rows.filter((r) => r.cited).length} of these {rows.length}.
      </p>
      <ul className="related-list">
        {rows.map((r) => (
          <li key={r.title}>
            <div>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              ) : (
                <strong>{r.title}</strong>
              )}
              <span className="related-meta">{[r.venue, r.year, r.citations ? `${r.citations} citations` : ""].filter(Boolean).join(", ")}</span>
            </div>
            <div className="related-sim" title="Similarity to your paper">
              {r.similarity.toFixed(2)}
              <span className="mini-progress" aria-hidden="true">
                <span style={{ width: `${r.similarity * 100}%` }} />
              </span>
            </div>
            <span className={`chip ${r.cited ? "chip-ok" : ""}`}>{r.cited ? "Cited" : "Not cited"}</span>
          </li>
        ))}
      </ul>
      {errors.length > 0 && <p className="small muted">Some sources were unavailable: {errors.join("; ")}</p>}
    </>
  );
}

export default function PaperDetail({ id, onChanged, onDeleted }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("about");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    api.getProject(id).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  const revise = async ({ filename, content_base64 }) => {
    setBusy(true);
    try {
      setProject(await api.analyseRevisedPaper(id, { filename, content_base64 }));
      setUploading(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Move “${project.title}” to the trash? You can restore it for 30 days.`)) return;
    await api.deleteProject(id);
    onDeleted();
  };

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <a href="#/papers">Paper analyses</a>
      <Icon name="chevronRight" size={13} />
      <span aria-current="page">{project?.title || "Paper"}</span>
    </nav>
  );

  if (error) {
    return (
      <>
        {breadcrumb}
        <Alert kind="error">{error}</Alert>
      </>
    );
  }
  if (!project) {
    return (
      <div className="skeleton-page" aria-busy="true" aria-label="Loading">
        <span className="skeleton h-title" />
        <span className="skeleton h-card" />
      </div>
    );
  }
  const paper = project.paper;
  if (!paper?.standalone) {
    return (
      <>
        {breadcrumb}
        <Alert kind="error">This paper analysis was not found.</Alert>
      </>
    );
  }

  const { about, score } = paper;
  const c = analysisCounts(paper.analysis);
  return (
    <div className="paper-detail">
      {breadcrumb}
      <header className="page-head project-head">
        <div className="project-head-main">
          <span className="eyebrow">{[about.field, about.paper_type].filter(Boolean).join(", ")}</span>
          <h1>{about.title}</h1>
          {about.one_line && <p className="paper-lede">{about.one_line}</p>}
        </div>
        <div className="project-head-actions">
          <button className="btn btn-secondary" onClick={() => setUploading((v) => !v)} aria-expanded={uploading} disabled={busy}>
            <Icon name="refresh" size={15} /> Upload Revised Draft
          </button>
          <button className="btn btn-ghost btn-danger" onClick={remove} disabled={busy}>
            <Icon name="trash" size={15} /> Move to Trash
          </button>
        </div>
      </header>

      {!about.is_research_paper && (
        <Alert kind="warn">This document does not look like a research paper, so parts of the analysis may not apply.</Alert>
      )}
      {uploading && <UploadForm busy={busy} revision withNote={false} onSubmit={revise} onCancel={() => setUploading(false)} />}
      <div aria-live="polite">
        {busy && <Alert kind="info">Analysing the revised draft. This can take a minute or two.</Alert>}
      </div>

      <dl className="kpis">
        <div className="kpi">
          <dt>Paper score</dt>
          <dd>
            <span className={`kpi-value ${BAND_CLASS[score.band] || ""}`}>{score.total.toFixed(1)}</span>
            <span className="kpi-unit">/ 100</span>
          </dd>
          <dd className="kpi-sub">{qualityBand(score.band)} paper</dd>
        </div>
        <div className="kpi">
          <dt>Questions answered</dt>
          <dd>
            <span className="kpi-value">{c.items[1] ? ratio(c.items) : "—"}</span>
          </dd>
          <dd className="kpi-sub">stated by the paper</dd>
        </div>
        <div className="kpi">
          <dt>Claims supported</dt>
          <dd>
            <span className="kpi-value">{ratio(c.claims)}</span>
          </dd>
          <dd className="kpi-sub">abstract and conclusion</dd>
        </div>
        <div className="kpi">
          <dt>Consistency checks</dt>
          <dd>
            <span className="kpi-value">{ratio(c.consistency)}</span>
          </dd>
          <dd className="kpi-sub">passed</dd>
        </div>
      </dl>

      <section className="card paper-card">
        <div className="row-between">
          <p className="small muted paper-file">
            <Icon name="file" size={13} /> {paper.file.name}, {paper.file.pages ? `${paper.file.pages} pages, ` : ""}
            {paper.file.words.toLocaleString()} words, draft {(paper.drafts || []).length + 1}
          </p>
          <MethodChip method={paper.method} note={paper.note} />
        </div>
        <div className="subtabs" role="tablist" aria-label="Analysis sections">
          {SECTIONS.map(([key, label, icon]) => (
            <button key={key} type="button" role="tab" id={`pa-tab-${key}`} aria-selected={section === key} aria-controls="pa-section" onClick={() => setSection(key)}>
              <Icon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>
        <div id="pa-section" role="tabpanel" aria-labelledby={`pa-tab-${section}`} className="plan-section">
          {section === "about" && <About about={about} />}
          {section === "analysis" && <Analysis paper={paper} />}
          {section === "score" && <Quality paper={paper} />}
          {section === "related" && <Related paper={paper} />}
          {section === "checks" && <Checks paper={paper} />}
        </div>
      </section>
    </div>
  );
}
