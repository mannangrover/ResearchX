import { useRef, useState } from "react";
import Icon from "./Icon";
import { Alert, StageCard } from "./common";
import { Delta } from "./Versions";

const ACCEPT = ".pdf,.docx,.tex,.md,.txt";
const MAX_MB = 30;

// Quality bands (older evaluations used the readiness-style names on the right)
export const BAND_CLASS = { Strong: "band-strong", Adequate: "band-limited", Weak: "band-weak", "Ready for review": "band-strong", "Needs revision": "band-limited", "Major revision": "band-weak" };
const OLD_BAND = { "Ready for review": "Strong", "Needs revision": "Adequate", "Major revision": "Weak" };
export const qualityBand = (band) => OLD_BAND[band] || band;
const GAP = { addressed: ["Addressed", "chip-ok"], partial: ["Partly", "chip-warn"], not_addressed: ["Not addressed", ""] };
const RQ = { answered: ["Answered", "chip-ok"], partial: ["Partly", "chip-warn"], not_answered: ["Not answered", ""] };
const PLAN = { done: ["Done", "chip-ok"], changed: ["Changed", "chip-accent"], not_done: ["Not done", ""] };
const EFFECT = { stronger: ["stronger", "chip-ok"], similar: ["similar rigour", ""], weaker: ["weaker", "chip-warn"] };
const DIFF = { clear: ["Clearly positioned", "chip-ok"], partial: ["Partly positioned", "chip-warn"], unclear: ["Not positioned", "chip-warn"] };

const ANSWERED = { answered: ["Answered", "chip-ok"], partial: ["Partly", "chip-warn"], not_answered: ["Not answered", "chip-danger"] };
const CLAIM = { supported: ["Supported", "chip-ok"], partial: ["Partly", "chip-warn"], unsupported: ["Unsupported", "chip-danger"] };
const CHECK = { pass: ["check", "ok"], warn: ["alert", "warn"], fail: ["x", "fail"] };
const ITEM_TYPE = { research_question: "Research question", objective: "Aim", hypothesis: "Hypothesis", contribution: "Contribution" };

const SECTIONS = [
  ["analysis", "Paper analysis", "search"],
  ["score", "Score & fixes", "gauge"],
  ["journey", "Compared with project", "layers"],
  ["checks", "Checks", "check"],
];

const Chip = ({ map, value, prefix = "" }) => {
  const [label, cls] = map[value] || [value, ""];
  return (
    <span className={`chip ${cls}`}>
      {prefix}
      {label}
    </span>
  );
};

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

// "2 of 3", allowing halves for partial matches
export const ratio = ([got, total]) => `${Number.isInteger(got) ? got : got.toFixed(1)} of ${total}`;

export function analysisCounts(a) {
  const count = (rows, full, half) => rows.reduce((n, r) => n + (r.status === full ? 1 : r.status === half ? 0.5 : 0), 0);
  return {
    items: [count(a.items, "answered", "partial"), a.items.length],
    claims: [count(a.claims, "supported", "partial"), a.claims.length],
    consistency: [a.consistency.filter((c) => c.status === "pass").length, a.consistency.length],
  };
}

function journeyCounts(j) {
  const count = (rows, full, half) => rows.reduce((n, r) => n + (r.status === full ? 1 : r.status === half ? 0.5 : 0), 0);
  return {
    gaps: [count(j.gaps, "addressed", "partial"), j.gaps.length],
    questions: [count(j.research_questions, "answered", "partial"), j.research_questions.length],
    plan: [count(j.plan, "done"), j.plan.length],
    changed: j.plan.filter((r) => r.status === "changed").length,
  };
}

export function UploadForm({ busy, revision, withNote = true, onSubmit, onCancel }) {
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
    setError("");
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
            <span className="small muted">{(file.size / 1024 / 1024).toFixed(2)} MB · click to change</span>
          </span>
        ) : (
          <span>
            <strong>{revision ? "Upload the revised draft" : "Upload your paper"}</strong>
            <span className="small muted">Drag a file here or click to browse · PDF, DOCX, TeX, Markdown or text · up to {MAX_MB} MB, 300 pages</span>
          </span>
        )}
      </label>
      {withNote && (
      <div className="field">
        <label htmlFor="paper-note">
          Did you change anything from your plan? <span className="muted">(optional)</span>
        </label>
        <textarea
          id="paper-note"
          name="change_note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Added a stronger distillation baseline; skipped the thermal study because the device was unavailable…"
        />
      </div>
      )}
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

export function Analysis({ paper }) {
  const a = paper.analysis;
  return (
    <>
      {paper.summary && <p className="paper-summary">{paper.summary}</p>}

      <div>
        <h3 className="sub-title">
          <Icon name="lightbulb" size={15} /> What the paper sets out to do — and whether it does
        </h3>
        {a.items.length ? (
          <ul className="journey-rows analysis-rows">
            {a.items.map((i, n) => (
              <li key={n}>
                <span>
                  <span className="item-type">{ITEM_TYPE[i.type]}</span>
                  {i.text}
                  <span className="small muted block">
                    {i.status !== "not_answered" && i.where_answered ? `Answered in ${i.where_answered}. ` : ""}
                    {i.comment}
                  </span>
                  {i.evidence && <q className="small evidence">{i.evidence}</q>}
                </span>
                <Chip map={ANSWERED} value={i.status} />
              </li>
            ))}
          </ul>
        ) : (
          <Alert kind="warn">The paper does not state clear research questions, aims or contributions. Add them to the introduction.</Alert>
        )}
      </div>

      <div>
        <h3 className="sub-title">
          <Icon name="target" size={15} /> Are the main claims backed by the results?
        </h3>
        <ul className="journey-rows">
          {a.claims.map((c, n) => (
            <li key={n}>
              <span>
                <span className="item-type">{c.source === "abstract" ? "Abstract" : "Conclusion"}</span>
                <q>{c.claim}</q>
                {c.evidence && <span className="small muted block">{c.evidence}</span>}
              </span>
              <Chip map={CLAIM} value={c.status} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="sub-title">
          <Icon name="check" size={15} /> Internal consistency
        </h3>
        <ul className="consistency">
          {a.consistency.map((c) => (
            <li key={c.key} className={CHECK[c.status][1]}>
              <Icon name={CHECK[c.status][0]} size={15} />
              <div>
                <strong>{c.label}</strong>
                {c.comment && <span className="small muted">{c.comment}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function Quality({ paper }) {
  const drafts = paper.drafts || [];
  return (
    <>
      <ul className="criteria">
        {paper.score.parts.map((p) => (
          <li key={p.key}>
            <div className="criteria-head">
              <strong>{p.name}</strong>
              <span className="tabular">
                {p.score} <span className="muted">/ {p.max}</span>
              </span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${(p.score / p.max) * 100}%` }} />
            </div>
            {p.comment && <span className="small muted">{p.comment}</span>}
          </li>
        ))}
      </ul>

      <div className="grid-2">
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="star" size={15} /> Strengths
          </h3>
          {paper.strengths.length ? (
            <ul className="check-list">
              {paper.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No strengths listed.</p>
          )}
        </div>
        <div className="list-card">
          <h3 className="sub-title">
            <Icon name="alert" size={15} /> What to improve
          </h3>
          {paper.fixes.length ? (
            <ol className="fix-list">
              {paper.fixes.slice(0, 6).map((f, i) => (
                <li key={i}>
                  <span className={`dot dot-${f.priority}`} title={`${f.priority} priority`} />
                  <div>
                    <strong>{f.issue}</strong>
                    <span className="small muted">{f.fix}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">Nothing important to fix.</p>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Draft</th>
                <th scope="col">File</th>
                <th scope="col" className="num">
                  Paper score
                </th>
                <th scope="col" className="num">
                  Questions answered
                </th>
                <th scope="col" className="num">
                  Claims supported
                </th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.draft}>
                  <th scope="row">Draft {d.draft}</th>
                  <td className="wrap">{d.file}</td>
                  <td className="num">{d.score.toFixed(1)}</td>
                  <td className="num">{ratio(d.counts.items)}</td>
                  <td className="num">{ratio(d.counts.claims)}</td>
                </tr>
              ))}
              <tr className="row-current">
                <th scope="row">Draft {drafts.length + 1} (latest)</th>
                <td className="wrap">{paper.file.name}</td>
                <td className="num">
                  {paper.score.total.toFixed(1)} <Delta value={paper.score.total - drafts.at(-1).score} />
                </td>
                <td className="num">{ratio(analysisCounts(paper.analysis).items)}</td>
                <td className="num">{ratio(analysisCounts(paper.analysis).claims)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function JourneyStep({ stage, title, children }) {
  return (
    <li className="journey-step">
      <span className="journey-stage">Stage {stage}</span>
      <div className="journey-body">
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Journey({ paper }) {
  const j = paper.journey;
  const c = journeyCounts(j);
  const closest = paper.references.related_coverage.slice(0, 3);
  return (
    <>
      <p className="small muted">
        For information only: how the paper relates to what ResearchX found earlier in this project. It does not change the
        paper score, and changing direction or plan is allowed.
      </p>
      <div className="tags">
        <span className="tag">Gaps addressed: {ratio(c.gaps)}</span>
        <span className="tag">Project questions answered: {ratio(c.questions)}</span>
        <span className="tag">Plan done: {c.plan[1] ? `${ratio(c.plan)} · ${c.changed} changed` : "no plan"}</span>
      </div>
      {j.summary && <p className="paper-summary">{j.summary}</p>}
      <ol className="journey">
        <JourneyStep stage={3} title="Closest related work">
          <div className="row-between">
            <span className="small muted">{j.differentiation.comment}</span>
            <Chip map={DIFF} value={j.differentiation.status} />
          </div>
          <ul className="journey-rows">
            {closest.map((c) => (
              <li key={c.title}>
                <span>{c.title}</span>
                <span className={`chip ${c.cited ? "chip-ok" : ""}`}>{c.cited ? "Cited" : "Not cited"}</span>
              </li>
            ))}
          </ul>
        </JourneyStep>

        <JourneyStep stage={5} title="Research gaps">
          <ul className="journey-rows">
            {j.gaps.map((g) => (
              <li key={g.id}>
                <span>
                  <b>{g.id}</b> {g.title}
                </span>
                <Chip map={GAP} value={g.status} />
              </li>
            ))}
          </ul>
        </JourneyStep>

        <JourneyStep stage={6} title="Research questions">
          <ul className="journey-rows">
            {j.research_questions.map((q) => (
              <li key={q.id}>
                <span>
                  <b>{q.id}</b> {q.question}
                </span>
                <Chip map={RQ} value={q.status} />
              </li>
            ))}
          </ul>
        </JourneyStep>

        <JourneyStep stage={7} title="Experiment plan">
          {!j.has_plan ? (
            <p className="small muted">No experiment plan was made for this version, so there is nothing to compare.</p>
          ) : (
            <>
              <p className="small muted">
                Changing the plan is fine. Changes are rated by whether they made the work stronger or weaker.
                {paper.change_note && (
                  <>
                    {" "}
                    Your note: <q>{paper.change_note}</q>
                  </>
                )}
              </p>
              <ul className="journey-rows">
                {j.plan.map((r) => (
                  <li key={r.id}>
                    <span>
                      <b>{r.id}</b> <span className="muted">{r.kind}:</span> {r.label.length > 110 ? `${r.label.slice(0, 110)}…` : r.label}
                      {r.comment && <span className="small muted block">{r.comment}</span>}
                    </span>
                    <span className="chips">
                      <Chip map={PLAN} value={r.status} />
                      {r.effect && <Chip map={EFFECT} value={r.effect} />}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </JourneyStep>
      </ol>
    </>
  );
}

export function Checks({ paper }) {
  const k = paper.checks;
  const r = paper.references;
  return (
    <div className="checks-grid">
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="file" size={15} /> Structure
        </h3>
        <dl className="kv">
          <dt>Words</dt>
          <dd>{k.words.toLocaleString()}</dd>
          <dt>Abstract</dt>
          <dd>
            {k.abstract_words} words · {k.abstract_has_numbers ? "reports results" : "no numbers"}
          </dd>
          <dt>Figures</dt>
          <dd>
            {k.figures} figures · {k.tables} tables
          </dd>
          <dt>Missing</dt>
          <dd>{k.missing_sections.length ? k.missing_sections.join(", ") : "No standard section missing"}</dd>
        </dl>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="book" size={15} /> References
        </h3>
        <dl className="kv">
          <dt>Entries</dt>
          <dd>
            {r.count} · {r.style} style
          </dd>
          <dt>Problems</dt>
          <dd>
            {r.missing.length ? `cited but not listed: ${r.missing.join(", ")}` : "none found"}
            {r.uncited.length > 0 && ` · listed but never cited: ${r.uncited.join(", ")}`}
          </dd>
        </dl>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="refresh" size={15} /> Reproducibility
        </h3>
        <ul className="repro-list">
          {paper.reproducibility.map((x) => (
            <li key={x.key} className={x.ok ? "ok" : "no"} title={x.evidence || "Not found in the paper"}>
              <Icon name={x.ok ? "check" : "x"} size={14} />
              <span>{x.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="list-card">
        <h3 className="sub-title">
          <Icon name="alert" size={15} /> Claims without evidence ({k.unsupported_claim_count})
        </h3>
        {k.unsupported_claims.length ? (
          <ul className="plan-items">
            {k.unsupported_claims.slice(0, 4).map((c) => (
              <li key={c}>
                <q>{c}</q>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Every strong claim has a number or a citation.</p>
        )}
      </div>
    </div>
  );
}

export default function PaperPanel({ project, running, disabled, onRun }) {
  const paper = project.paper;
  const outdated = paper && !paper.analysis; // evaluated by an earlier version of this stage
  const [uploading, setUploading] = useState(false);
  const [section, setSection] = useState("analysis");

  const submit = async (body) => {
    if (await onRun(body)) setUploading(false);
  };

  if (!paper || outdated) {
    return (
      <StageCard
        stage={8}
        title="Paper evaluation"
        description="Upload the paper you wrote. ResearchX analyses the paper itself: are the questions, aims and contributions it states actually answered, are its claims backed by its results, and is it consistent. It also shows how the paper relates to the rest of this project."
      >
        {outdated && <Alert kind="info">This paper was evaluated with an earlier version of this stage. Upload it again to see the new evaluation.</Alert>}
        <UploadForm busy={running} onSubmit={submit} />
      </StageCard>
    );
  }

  const s = paper.score;
  const c = analysisCounts(paper.analysis);
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
        <div className="paper-score main">
          <span className="small muted">Paper score</span>
          <strong className={BAND_CLASS[s.band]}>
            {s.total.toFixed(1)}
            <span className="kpi-unit"> / 100</span>
          </strong>
          <span className={`small ${BAND_CLASS[s.band]}`}>{qualityBand(s.band)} paper</span>
        </div>
        <div className="paper-score">
          <span className="small muted">Questions & aims answered</span>
          <strong>{c.items[1] ? ratio(c.items) : "—"}</strong>
          <span className="small muted">stated by the paper</span>
        </div>
        <div className="paper-score">
          <span className="small muted">Claims supported</span>
          <strong>{ratio(c.claims)}</strong>
          <span className="small muted">abstract & conclusion</span>
        </div>
        <div className="paper-score">
          <span className="small muted">Consistency checks</span>
          <strong>{ratio(c.consistency)}</strong>
          <span className="small muted">passed</span>
        </div>
      </div>
      <p className="small muted paper-file">
        <Icon name="file" size={13} /> {paper.file.name} · {paper.file.pages ? `${paper.file.pages} pages · ` : ""}
        {paper.file.words.toLocaleString()} words · draft {(paper.drafts || []).length + 1}
      </p>

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
        {section === "analysis" && <Analysis paper={paper} />}
        {section === "score" && <Quality paper={paper} />}
        {section === "journey" && <Journey paper={paper} />}
        {section === "checks" && <Checks paper={paper} />}
      </div>
    </StageCard>
  );
}
