import Icon from "./Icon";

const AGREEMENT_CLASS = {
  "Strong agreement": "band-strong",
  "Moderate agreement": "band-moderate",
  "Weak agreement": "band-limited",
};

function DiffCell({ diff }) {
  const cls = Math.abs(diff) <= 1 ? "diff-ok" : Math.abs(diff) <= 2.5 ? "diff-mid" : "diff-big";
  return (
    <td className="num">
      <span className={`diff ${cls}`}>{diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}</span>
    </td>
  );
}

export default function ScoreComparison({ rule, llm, comparison, note }) {
  if (!llm || !comparison) {
    return (
      <div className="compare">
        <h3 className="sub-title">Rule-based vs LLM score</h3>
        <p className="muted small">LLM score unavailable{note ? `: ${note}` : ""}.</p>
      </div>
    );
  }
  const llmByKey = Object.fromEntries(llm.dimensions.map((d) => [d.key, d]));

  return (
    <div className="compare">
      <div className="sub-head">
        <h3 className="sub-title">Rule-based vs LLM judge</h3>
        <span className="small muted">Two independent scoring methods on the same evidence</span>
      </div>
      <div className="compare-totals">
        <div>
          <span className="kpi-label">
            <Icon name="layers" size={13} /> Rule-based (formulas)
          </span>
          <b>{rule.total.toFixed(1)}</b>
          <span className="small muted">{rule.band}</span>
        </div>
        <div>
          <span className="kpi-label">
            <Icon name="sparkle" size={13} /> LLM judge · {llm.model}
          </span>
          <b>{llm.total.toFixed(1)}</b>
          <span className="small muted">{llm.band}</span>
        </div>
        <div>
          <span className="kpi-label">Agreement</span>
          <b className={`b-text ${AGREEMENT_CLASS[comparison.agreement]}`}>{comparison.agreement}</b>
          <span className="small muted">
            mean |diff| {comparison.mean_abs_diff} · {comparison.same_band ? "same band" : "different band"}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="num">
                Rule
              </th>
              <th scope="col" className="num">
                LLM
              </th>
              <th scope="col" className="num">
                Diff
              </th>
              <th scope="col">LLM reasoning</th>
            </tr>
          </thead>
          <tbody>
            {comparison.dimensions.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.name}</th>
                <td className="num">{r.rule.toFixed(1)}</td>
                <td className="num">{r.llm.toFixed(1)}</td>
                <DiffCell diff={r.diff} />
                <td className="reason-cell">{llmByKey[r.key]?.reason}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Weighted total (/100)</th>
              <td className="num">{rule.total.toFixed(1)}</td>
              <td className="num">{llm.total.toFixed(1)}</td>
              <DiffCell diff={comparison.total_diff / 10} />
              <td className="reason-cell">Largest disagreement: {comparison.largest_gap}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="small muted">
        The LLM saw the same evidence and rubric but not the rule-based numbers. Diff = LLM − rule (total diff shown on
        the 0–10 scale).
      </p>
    </div>
  );
}
