import { useRef, useState } from "react";
import Icon from "./Icon";
import { Alert, StageCard } from "./common";
import { Delta } from "./Versions";

const ACCEPT = ".pdf,.docx,.tex,.md,.txt";
const MAX_MB = 15;

const STATUS = {
  followed: ["Followed", "chip-ok"],
  improved: ["Improved", "chip-accent"],
  changed: ["Changed", "chip-warn"],
  missing: ["Missing", "chip-danger"],
};
const OUTCOME = {
  supported: ["Supported", "chip-ok"],
  refuted: ["Refuted", "chip-warn"],
  inconclusive: ["Inconclusive", ""],
  not_reported: ["Not reported", "chip-danger"],
};
const RQ_STATUS = { answered: ["Answered", "chip-ok"], partial: ["Partly answered", "chip-warn"], missing: ["Not answered", "chip-danger"] };
const VERDICT_KIND = { follows: "info", justify: "warn", not_following: "error" };
const BAND_CLASS = { "Ready for review": "band-strong", "Needs revision": "band-limited", "Major gaps": "band-weak" };

const SECTIONS = [
  ["overview", "Overview", "gauge"],
  ["compliance", "Plan compliance", "check"],
  ["questions", "Questions & hypotheses", "target"],
  ["structure", "Structure & claims", "file"],
  ["references", "References", "book"],
  ["repro", "Reproducibility", "refresh"],
];

const Chip = ({ map, value }) => {
  const [label, cls] = map[value] || [value, ""];
  return <span className={`chip ${cls}`}>{label}</span>;
};

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function UploadForm({ busy, revision, onSubmit, onCancel }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    setError("");
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return setError(`The file is larger than ${MAX_MB} MB.`);
    if (!/\.(pdf|docx|tex|md|txt)$/i.test(f.name)) return setError("Upload a PDF, Word (.docx), LaTeX (.tex), Markdown or text file.");
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError("Choose your paper first.");
    try {
      await onSubmit({ filename: file.name, content_base64: await readBase64(file), change_note: note.trim() });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="paper-upload" onSubmit={submit}>
      <label
        className={`dropzone ${drag ? "is-drag" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files[0])} />
        <Icon name={file ? "check" : "file"} size={22} />
        {file ? (
          <span>
            <strong>{file.name}</strong>
            <span className="small muted"> · {(file.size / 1024 / 1024).toFixed(2)} MB — click to change</span>
          </span>
        ) : (
          <span>
            <strong>{revision ? "Upload the revised draft" : "Upload your paper"}</strong>
            <span className="small muted">Drag a file here or click to browse · PDF, DOCX, TeX, Markdown or text · up to {MAX_MB} MB</span>
          </span>
        )}
      </label>
      <div className="field">
        <label htmlFor="paper-note">
          Changes from the stage 7 plan <span className="muted">(required if you deviated)</span>
        </label>
        <textarea
          id="paper-note"
          name="change_note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Used ImageNet-pretrained ResNet-50 as an extra baseline because it is stronger than the planned one; replaced dataset X with Y because Y is the standard benchmark…"
        />
        <span className="help">
          Your paper must implement the plan. A change is accepted only when it is explained and at least as rigorous as the
          plan (a stronger baseline, a more standard dataset, an extra metric).
        </span>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="search" size={15} />}
          {busy ? "Evaluating the paper…" : "Upload & Evaluate"}
        </button>
      </div>
    </form>
  );
}

function Overview({ paper }) {
  const r = paper.readiness;
  const drafts = paper.drafts || [];
  const prev = drafts.at(-1);
  return (
    <>
      {paper.summary && <p className="plan-objective">{paper.summary}</p>}
      <div className="paper-parts">
        {r.parts.map((p) => (
          <div key={p.key} className="paper-part">
            <div className="paper-part-head">
              <span>{p.name}</span>
              <span className="tabular">
                <strong>{p.score}</strong> / {p.max}
              </span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${(p.score / p.max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {paper.strengths.length > 0 && (
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="star" size={15} /> Strengths
          </h3>
          <ul className="check-list">
            {paper.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="sub-title">
          <Icon name="alert" size={15} /> What to fix, most important first
        </h3>
        {paper.fixes.length ? (
          <ol className="fix-list">
            {paper.fixes.map((f, i) => (
              <li key={i} className={`fix fix-${f.priority}`}>
                <span className={`chip ${f.priority === "high" ? "chip-danger" : f.priority === "medium" ? "chip-warn" : ""}`}>{f.priority}</span>
                <div>
                  <strong>{f.issue}</strong>
                  <span className="small muted">
                    {f.section && `${f.section} · `}
                    {f.fix}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">Nothing to fix was found.</p>
        )}
      </div>

      {drafts.length > 0 && (
        <div>
          <h3 className="sub-title">
            <Icon name="layers" size={15} /> Drafts
          </h3>
          <div className="table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Draft</th>
                  <th scope="col">File</th>
                  <th scope="col" className="num">
                    Readiness
                  </th>
                  <th scope="col" className="num">
                    Plan coverage
                  </th>
                  <th scope="col">Plan verdict</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.draft}>
                    <th scope="row">Draft {d.draft}</th>
                    <td className="wrap">{d.file}</td>
                    <td className="num">{d.readiness.toFixed(1)}</td>
                    <td className="num">{Math.round(d.coverage * 100)}%</td>
                    <td>{d.verdict}</td>
                  </tr>
                ))}
                <tr className="row-current">
                  <th scope="row">Draft {drafts.length + 1} (latest)</th>
                  <td className="wrap">{paper.file.name}</td>
                  <td className="num">
                    {r.total.toFixed(1)} <Delta value={r.total - prev.readiness} />
                  </td>
                  <td className="num">{Math.round(paper.compliance.coverage * 100)}%</td>
                  <td>{paper.compliance.verdict_label}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Compliance({ paper }) {
  const c = paper.compliance;
  return (
    <>
      <div className="tags">
        {Object.entries(STATUS).map(([k, [label, cls]]) => (
          <span key={k} className={`chip ${cls}`}>
            {label}: <strong>{c.counts[k]}</strong>
          </span>
        ))}
      </div>
      {paper.change_note && (
        <p className="small muted">
          <strong>Your change note:</strong> {paper.change_note}
        </p>
      )}
      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Plan item</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence in the paper</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((it) => (
              <tr key={it.id}>
                <th scope="row" className="wrap">
                  <span className="id-badge">{it.id}</span> <span className="small muted">{it.kind}</span>
                  <span className="plan-item-label">{it.label}</span>
                </th>
                <td>
                  <Chip map={STATUS} value={it.status} />
                </td>
                <td className="small">
                  {it.evidence && <q>{it.evidence}</q>}
                  {it.comment && <span className="muted block">{it.comment}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Questions({ paper }) {
  return (
    <div className="grid-2">
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="lightbulb" size={15} /> Research questions
        </h3>
        <ul className="plan-items">
          {paper.research_questions.map((q) => (
            <li key={q.id}>
              <span className="row-between">
                <strong>{q.id}</strong> <Chip map={RQ_STATUS} value={q.status} />
              </span>
              <span>{q.question}</span>
              {q.evidence && <q className="muted">{q.evidence}</q>}
            </li>
          ))}
        </ul>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="flask" size={15} /> Hypotheses from the plan
        </h3>
        <ul className="plan-items">
          {paper.hypotheses.map((h) => (
            <li key={h.id}>
              <span className="row-between">
                <strong>{h.id}</strong> <Chip map={OUTCOME} value={h.outcome} />
              </span>
              <span>{h.statement}</span>
              {h.evidence && <q className="muted">{h.evidence}</q>}
            </li>
          ))}
        </ul>
        <p className="small muted">A refuted hypothesis is a valid result. Only “not reported” counts against the paper.</p>
      </div>
    </div>
  );
}

function Structure({ paper }) {
  const k = paper.checks;
  const facts = [
    ["Words", k.words.toLocaleString()],
    ["Abstract", `${k.abstract_words} words${k.abstract_has_numbers ? " · reports numbers" : " · no numbers"}`],
    ["Figures", k.figures],
    ["Tables", k.tables],
  ];
  return (
    <>
      <dl className="stats">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {k.missing_sections.length > 0 && <Alert kind="warn">Missing sections: {k.missing_sections.join(", ")}.</Alert>}
      <div className="grid-2">
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="file" size={15} /> Sections found
          </h3>
          <ol className="outline">
            {paper.outline.map((o, i) => (
              <li key={i}>
                <span>{o.title}</span>
                <span className="muted tabular">{o.words} words</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="alert" size={15} /> Claims without evidence ({k.unsupported_claim_count})
          </h3>
          {k.unsupported_claims.length ? (
            <ul className="plan-items">
              {k.unsupported_claims.map((c) => (
                <li key={c}>
                  <q>{c}</q>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Every strong claim is backed by a number or a citation.</p>
          )}
        </div>
      </div>
    </>
  );
}

function References({ paper }) {
  const r = paper.references;
  return (
    <>
      <dl className="stats">
        <div>
          <dt>Reference entries</dt>
          <dd>{r.count}</dd>
        </div>
        <div>
          <dt>Citation style</dt>
          <dd>{r.style}</dd>
        </div>
        <div>
          <dt>Cited in the text</dt>
          <dd>{r.cited}</dd>
        </div>
      </dl>
      {r.missing.length > 0 && <Alert kind="error">Cited but not in the reference list: {r.missing.join(", ")}</Alert>}
      {r.uncited.length > 0 && <Alert kind="warn">In the reference list but never cited: {r.uncited.join(", ")}</Alert>}
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="book" size={15} /> Closest related work from stage 3
        </h3>
        <ul className="plan-items">
          {r.related_coverage.map((c) => (
            <li key={c.title} className="row-between">
              <span>
                {c.title} <span className="muted">({c.year || "n.d."})</span>
              </span>
              <span className={`chip ${c.cited ? "chip-ok" : "chip-warn"}`}>{c.cited ? "Cited" : "Not cited"}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Reproducibility({ paper }) {
  return (
    <ul className="repro-list">
      {paper.reproducibility.map((r) => (
        <li key={r.key} className={r.ok ? "ok" : "no"}>
          <Icon name={r.ok ? "check" : "x"} size={15} />
          <div>
            <strong>{r.label}</strong>
            <span className="small muted">{r.ok ? r.evidence : "Not found in the paper."}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PaperPanel({ project, running, disabled, onRun }) {
  const paper = project.paper;
  const [uploading, setUploading] = useState(false);
  const [section, setSection] = useState("overview");

  const submit = async (body) => {
    if (await onRun(body)) setUploading(false);
  };

  const intro = (
    <ol className="paper-steps">
      <li>
        <strong>Implement</strong> the stage 7 experiment plan.
      </li>
      <li>
        <strong>Write</strong> your paper.
      </li>
      <li>
        <strong>Upload</strong> it here. ResearchX checks it against the plan and evaluates the whole paper.
      </li>
    </ol>
  );

  if (!paper) {
    return (
      <StageCard
        stage={8}
        title="Paper evaluation"
        description="Your paper is evaluated against the experiment plan you committed to in stage 7 (mandatory), then for research-question coverage, structure, claims, references and reproducibility."
      >
        {intro}
        <UploadForm busy={running} onSubmit={submit} />
      </StageCard>
    );
  }

  const r = paper.readiness;
  const c = paper.compliance;
  return (
    <StageCard
      stage={8}
      title="Paper evaluation"
      done
      method={paper.method}
      note={paper.note}
      action={
        <button className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => setUploading((v) => !v)} aria-expanded={uploading}>
          <Icon name="refresh" size={13} /> Upload Revised Draft
        </button>
      }
    >
      {uploading && <UploadForm busy={running} revision onSubmit={submit} onCancel={() => setUploading(false)} />}

      <div className="paper-head">
        <div className="paper-score">
          <span className="small muted">Readiness</span>
          <strong className={BAND_CLASS[r.band]}>{r.total.toFixed(1)}</strong>
          <span className={`small ${BAND_CLASS[r.band]}`}>{r.band}</span>
        </div>
        <div className="paper-score">
          <span className="small muted">Plan coverage</span>
          <strong>{Math.round(c.coverage * 100)}%</strong>
          <span className="small muted">
            {c.counts.followed + c.counts.improved} of {c.items.length} items
          </span>
        </div>
        <div className="paper-file">
          <Icon name="file" size={16} />
          <span>
            <strong>{paper.file.name}</strong>
            <span className="small muted">
              {paper.file.pages ? `${paper.file.pages} pages · ` : ""}
              {paper.file.words.toLocaleString()} words · draft {(paper.drafts || []).length + 1}
            </span>
          </span>
        </div>
      </div>

      <Alert kind={VERDICT_KIND[c.verdict]}>
        <strong>{c.verdict_label}.</strong>{" "}
        {c.verdict === "follows" && "The paper implements the stage 7 plan."}
        {c.verdict === "justify" &&
          "Some plan items were changed or left out. Explain each change in the change note and the paper, or follow the plan."}
        {c.verdict === "not_following" &&
          "Following the stage 7 plan is mandatory: a planned hypothesis or experiment is missing. Complete it, justify a better alternative, or regenerate the plan in stage 7 if you found a better approach."}
        {r.capped_by_plan && " Readiness is capped at 49 until the plan is followed."}
      </Alert>

      <div className="subtabs" role="tablist" aria-label="Evaluation sections">
        {SECTIONS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`paper-tab-${key}`}
            aria-selected={section === key}
            aria-controls="paper-section"
            onClick={() => setSection(key)}
          >
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>
      <div id="paper-section" role="tabpanel" aria-labelledby={`paper-tab-${section}`} className="plan-section">
        {section === "overview" && <Overview paper={paper} />}
        {section === "compliance" && <Compliance paper={paper} />}
        {section === "questions" && <Questions paper={paper} />}
        {section === "structure" && <Structure paper={paper} />}
        {section === "references" && <References paper={paper} />}
        {section === "repro" && <Reproducibility paper={paper} />}
      </div>
    </StageCard>
  );
}
