import { useState } from "react";
import Icon from "./Icon";
import { Alert, RunButton, StageCard, Tags } from "./common";

const SOURCE_LABEL = { openalex: "OpenAlex", semantic_scholar: "Semantic Scholar", arxiv: "arXiv" };
const nf = new Intl.NumberFormat("en");

function QueryEditor({ initial, disabled, onSearch }) {
  const [text, setText] = useState(initial.join("\n"));
  const queries = text.split("\n").map((q) => q.trim()).filter(Boolean);
  return (
    <div className="query-editor">
      <div className="field">
        <label htmlFor="queries">Search queries</label>
        <textarea
          id="queries"
          name="queries"
          rows={3}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="queries-help"
        />
        <span className="help" id="queries-help">
          One per line, up to 3. Edit them to steer the literature search.
        </span>
      </div>
      <button className="btn btn-secondary" disabled={disabled || !queries.length} onClick={() => onSearch(queries.slice(0, 3))}>
        <Icon name="search" size={14} /> Search With These Queries
      </button>
    </div>
  );
}

function PaperCard({ paper, rank, maxSim }) {
  const width = Math.max(4, (paper.similarity / (maxSim || 1)) * 100);
  return (
    <li className="paper">
      <span className="paper-rank" aria-label={`Rank ${rank}`}>
        {rank}
      </span>
      <div className="paper-body">
        <a href={paper.url} target="_blank" rel="noreferrer" className="paper-title">
          {paper.title}
        </a>
        <div className="paper-meta">
          <span>
            {paper.authors.slice(0, 3).join(", ")}
            {paper.authors.length > 3 && " et al."}
          </span>
          <span>{paper.year || "n.d."}</span>
          <span className="paper-venue">{paper.venue || SOURCE_LABEL[paper.source] || paper.source}</span>
          {paper.citations != null && <span>{nf.format(paper.citations)} citations</span>}
        </div>
        <div className="sim-row">
          <span className="sim-label">Similarity</span>
          <div className="sim-bar" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </div>
          <span className="sim-value">{paper.similarity.toFixed(3)}</span>
        </div>
        {paper.relation && (
          <dl className="relation">
            <div>
              <dt>Relates</dt>
              <dd>{paper.relation}</dd>
            </div>
            <div>
              <dt>Differs</dt>
              <dd>{paper.difference}</dd>
            </div>
          </dl>
        )}
        {paper.shared_terms?.length > 0 && <Tags items={paper.shared_terms} variant="tag-small" />}
        {paper.abstract && (
          <details className="disclosure">
            <summary>Abstract</summary>
            <p className="small">{paper.abstract}</p>
          </details>
        )}
      </div>
    </li>
  );
}

export default function LiteraturePanel({ data, defaultQueries, running, disabled, onRun }) {
  const action = (
    <RunButton label="Find Related Papers" done={!!data} running={running} disabled={disabled} onClick={() => onRun()} />
  );

  if (!data) {
    return (
      <StageCard
        stage={3}
        title="Literature analysis"
        description="Searches OpenAlex, Semantic Scholar and arXiv in parallel, removes duplicates, and ranks papers by semantic similarity to your project."
        action={action}
      >
        <QueryEditor initial={defaultQueries} disabled={disabled} onSearch={onRun} />
      </StageCard>
    );
  }

  const { stats } = data;
  const maxSim = data.papers[0]?.similarity;
  return (
    <StageCard stage={3} title="Related literature" done method={data.method} note={data.note} action={action}>
      <dl className="stats">
        <div>
          <dt>Papers retrieved</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>Year range</dt>
          <dd>
            {stats.year_min}–{stats.year_max}
          </dd>
        </div>
        <div>
          <dt>From last 3 years</dt>
          <dd>{Math.round(stats.recent_share * 100)}%</dd>
        </div>
        <div>
          <dt>Median citations</dt>
          <dd>{stats.median_citations ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Similarity model</dt>
          <dd className="dd-text">{data.embedding_backend}</dd>
        </div>
      </dl>
      <div className="sources">
        {Object.entries(data.retrieved_per_source).map(([s, n]) => (
          <span key={s} className="chip">
            {SOURCE_LABEL[s] || s} <strong>{n}</strong>
          </span>
        ))}
      </div>
      {data.errors?.length > 0 && <Alert kind="warn">{data.errors.join(" · ")}</Alert>}

      <h3 className="label list-label">Top {data.papers.length} closest papers</h3>
      <ol className="papers">
        {data.papers.map((p, i) => (
          <PaperCard key={p.title} paper={p} rank={i + 1} maxSim={maxSim} />
        ))}
      </ol>

      <details className="disclosure">
        <summary>Refine search queries</summary>
        <QueryEditor initial={data.queries} disabled={disabled} onSearch={onRun} />
      </details>
    </StageCard>
  );
}
