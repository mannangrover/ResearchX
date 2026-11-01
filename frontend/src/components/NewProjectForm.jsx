import { useState } from "react";
import { api } from "../api";
import Icon from "./Icon";
import { Alert } from "./common";
import { STAGES } from "../stages";
// Same examples as backend/scripts/examples.json (pre-computed in the demo account)
import EXAMPLES from "../examples.json";

const DOMAINS = [
  "Artificial Intelligence",
  "Machine Learning",
  "Natural Language Processing",
  "Computer Vision",
  "Software Engineering",
  "Information Retrieval",
  "Distributed Systems",
  "Cybersecurity",
  "Human-Computer Interaction",
  "Data Science",
  "Other Computer Science",
];

const EMPTY = { title: "", idea_text: "", github_url: "", domain: "" };

export default function NewProjectForm({ onCreated, projectCount }) {
  const [form, setForm] = useState(EMPTY);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const loadExample = (i) => {
    setForm({ ...EMPTY, ...EXAMPLES[i] });
    setPicked(i);
    document.getElementById("project-title")?.focus({ preventScroll: true });
    document.getElementById("new-project-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      onCreated(await api.createProject(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ideaLen = form.idea_text.trim().length;

  return (
    <div className="new-project">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">All projects</a>
        <Icon name="chevronRight" size={13} />
        <span aria-current="page">New project</span>
      </nav>
      <header className="page-head">
        <span className="eyebrow">Stage 1 · Idea / project input</span>
        <h1>Start a new research project</h1>
        <p className="lede">
          Describe an idea, link a GitHub repository, or both. ResearchX profiles it, finds the closest published work and
          estimates how much research opportunity is left.
        </p>
      </header>

      <section aria-labelledby="examples-title" className="examples">
        <div className="section-head">
          <h2 id="examples-title">Start from an example</h2>
          <span className="muted small">
            {projectCount > 0 ? "Each one is also pre-computed in your projects list" : "Click to fill the form"}
          </span>
        </div>
        <div className="example-grid">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.title}
              type="button"
              className={`example-card ${picked === i ? "selected" : ""}`}
              onClick={() => loadExample(i)}
              aria-pressed={picked === i}
            >
              <span className="example-domain">{ex.domain}</span>
              <span className="example-title">{ex.title}</span>
              <span className="example-idea">{ex.idea_text}</span>
              <span className="example-foot">
                {ex.github_url ? (
                  <>
                    <Icon name="github" size={13} /> {ex.github_url.replace("https://github.com/", "")}
                  </>
                ) : (
                  <>
                    <Icon name="lightbulb" size={13} /> Idea only
                  </>
                )}
                <Icon name={picked === i ? "check" : "arrowRight"} size={14} className="example-go" />
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="new-grid">
        <section className="card form-card" id="new-project-form" aria-labelledby="form-title">
          <h2 id="form-title" className="card-title">
            Project details
          </h2>
          <form onSubmit={submit} className="form">
            <div className="field">
              <label htmlFor="project-title">Project title</label>
              <input
                id="project-title"
                name="title"
                autoComplete="off"
                value={form.title}
                onChange={set("title")}
                placeholder="e.g. Federated learning for medical imaging…"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="project-idea">Research idea / project description</label>
              <textarea
                id="project-idea"
                name="idea_text"
                rows={7}
                value={form.idea_text}
                onChange={set("idea_text")}
                placeholder="What problem does it solve, how, and how would you evaluate it?…"
                aria-describedby="idea-help"
              />
              <span id="idea-help" className="help">
                {ideaLen > 0 && ideaLen < 20
                  ? `${20 - ideaLen} more characters needed, or add a GitHub repository.`
                  : "At least 20 characters, unless you link a repository. More detail gives better literature matches."}
              </span>
            </div>
            <div className="field-row">
              <div className="field grow">
                <label htmlFor="project-repo">
                  GitHub repository <span className="optional">optional</span>
                </label>
                <div className="input-icon">
                  <Icon name="github" size={15} />
                  <input
                    id="project-repo"
                    name="github_url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={form.github_url}
                    onChange={set("github_url")}
                    placeholder="https://github.com/owner/repo"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="project-domain">Domain</label>
                <select id="project-domain" name="domain" value={form.domain} onChange={set("domain")}>
                  <option value="">Select…</option>
                  {DOMAINS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <Alert kind="error">{error}</Alert>}

            <div className="form-actions">
              {picked !== null && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setForm(EMPTY);
                    setPicked(null);
                  }}
                >
                  Clear
                </button>
              )}
              <button className="btn btn-primary btn-lg" disabled={saving}>
                {saving ? <span className="spinner sm" aria-hidden="true" /> : <Icon name="arrowRight" size={16} />}
                {saving ? "Creating…" : "Create Project"}
              </button>
            </div>
          </form>
        </section>

        <aside className="card pipeline-card" aria-labelledby="pipeline-title">
          <h2 id="pipeline-title" className="card-title">
            What happens next
          </h2>
          <ol className="pipeline">
            {STAGES.filter((s) => s.built && s.n > 1).map((s) => (
              <li key={s.n}>
                <span className="pipeline-icon">
                  <Icon name={s.icon} size={15} />
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.output}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="small muted pipeline-note">
            Each stage runs on demand, so you can review and adjust the results before moving on.
          </p>
        </aside>
      </div>
    </div>
  );
}
