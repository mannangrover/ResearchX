import Icon from "./Icon";
import { RunButton, StageCard, Tags } from "./common";

const SIGNAL_LABELS = {
  has_tests: "Tests",
  has_ci: "CI",
  has_docs: "Docs",
  has_license: "Licence",
  has_dockerfile: "Docker",
  has_notebooks: "Notebooks",
  has_dependency_file: "Dependencies",
};

const nf = new Intl.NumberFormat("en");

function LanguageBar({ languages }) {
  const total = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(languages).slice(0, 6);
  if (!entries.length) return null;
  return (
    <div>
      <div className="lang-bar" aria-hidden="true">
        {entries.map(([lang, bytes], i) => (
          <span key={lang} className={`c${i}`} style={{ width: `${(bytes / total) * 100}%` }} />
        ))}
      </div>
      <div className="lang-legend">
        {entries.map(([lang, bytes], i) => (
          <span key={lang}>
            <i className={`dot c${i}`} aria-hidden="true" />
            {lang} <span className="muted">{Math.round((bytes / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field-block">
      <h3 className="label">{label}</h3>
      {children}
    </div>
  );
}

export default function ProfilePanel({ data, running, disabled, onRun }) {
  const action = <RunButton label="Run Analysis" done={!!data} running={running} disabled={disabled} onClick={onRun} />;

  if (!data) {
    return (
      <StageCard
        stage={2}
        title="Project analysis"
        description="Extracts the problem, approach, techniques and keywords. If a GitHub repository is linked, its README, file tree, languages and dependencies are analysed too."
        action={action}
      />
    );
  }

  const { profile: p, repository: repo } = data;
  return (
    <StageCard stage={2} title="Technical project profile" done method={data.method} note={data.note} action={action}>
      <p className="summary">{p.summary}</p>
      <div className="grid-2">
        <div className="stack">
          <Field label="Problem">
            <p>{p.problem}</p>
          </Field>
          <Field label="Approach">
            <p>{p.approach}</p>
          </Field>
        </div>
        <div className="stack">
          <Field label="Techniques">
            <Tags items={p.techniques} variant="tag-accent" />
          </Field>
          <Field label="Research keywords">
            <Tags items={p.keywords} />
          </Field>
          <Field label="Domain · contribution type">
            <p>
              {p.domain} · {p.contribution_type}
            </p>
          </Field>
        </div>
      </div>

      {repo && (
        <div className="repo-box">
          <div className="repo-head">
            <a href={repo.url} target="_blank" rel="noreferrer" className="repo-name">
              <Icon name="github" size={16} />
              {repo.owner}/{repo.name}
            </a>
            <span className="repo-stats">
              <span>
                <Icon name="star" size={13} /> {nf.format(repo.stars)}
              </span>
              <span>
                <Icon name="fork" size={13} /> {nf.format(repo.forks)}
              </span>
              <span>
                {nf.format(repo.code_file_count)} code files / {nf.format(repo.file_count)}
              </span>
              {repo.license && <span>{repo.license}</span>}
            </span>
          </div>
          {repo.description && <p className="small muted">{repo.description}</p>}
          <LanguageBar languages={repo.languages} />
          <ul className="signals" aria-label="Repository quality signals">
            {Object.entries(SIGNAL_LABELS).map(([k, label]) => (
              <li key={k} className={`signal ${repo.signals[k] ? "on" : "off"}`}>
                <Icon name={repo.signals[k] ? "check" : "x"} size={12} />
                {label}
                <span className="sr-only">{repo.signals[k] ? "present" : "missing"}</span>
              </li>
            ))}
          </ul>
          {Object.keys(repo.dependencies).length > 0 && (
            <details className="disclosure">
              <summary>Dependencies ({Object.values(repo.dependencies).flat().length})</summary>
              {Object.entries(repo.dependencies).map(([file, deps]) => (
                <div key={file} className="small dep-row">
                  <code>{file}</code> {deps.join(", ")}
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </StageCard>
  );
}
