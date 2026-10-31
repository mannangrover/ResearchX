"""Compare the rule-based ROS with the LLM-judged ROS on a saved project.

The rule-based score is deterministic, so it is computed once. The LLM judge is
run several times to measure how consistent it is.

Run from backend/:  python -m scripts.compare_scores ["project title"] [runs]
Writes the report to docs/score_comparison.md.
"""
import sys
from datetime import date
from pathlib import Path
from statistics import mean, pstdev

from app import database as db
from app.services import llm_scoring_service, llm_service, scoring_service

DEFAULT_TITLE = "Retrieval-augmented automated code review"
OUT = Path(__file__).resolve().parents[2] / "docs" / "score_comparison.md"


def main():
    title = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TITLE
    runs = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    db.init_db()
    match = next((p for p in db.list_projects() if p["title"] == title), None)
    if not match:
        sys.exit(f"No saved project titled '{title}'")
    project = db.get_project(match["id"])
    if not project["literature"]:
        sys.exit("Run stages 2 and 3 for this project first")

    prof = project["profile"]
    rule = scoring_service.compute_score(prof["profile"], prof["repository"], project["idea_text"], project["literature"])

    llm_runs = []
    for i in range(runs):
        try:
            llm_runs.append(llm_scoring_service.llm_score(project))
            print(f"LLM run {i + 1}: {llm_runs[-1]['total']}")
        except llm_service.LLMUnavailable as e:
            print(f"LLM run {i + 1} failed: {e}")
    if not llm_runs:
        sys.exit("All LLM runs failed")

    keys = [d["key"] for d in rule["dimensions"]]
    per_dim = {k: [next(d["score"] for d in r["dimensions"] if d["key"] == k) for r in llm_runs] for k in keys}
    totals = [r["total"] for r in llm_runs]
    avg_llm = {
        "total": round(mean(totals), 1),
        "band": scoring_service.band(mean(totals)),
        "dimensions": [{"key": k, "score": round(mean(per_dim[k]), 1)} for k in keys],
    }
    cmp = llm_scoring_service.compare(rule, avg_llm)

    lines = [
        f"# Rule-based vs LLM Research Opportunity Score",
        "",
        f"Project: **{project['title']}**" + (f" ({project['github_url']})" if project["github_url"] else ""),
        f"Date: {date.today()} · LLM judge: `{llm_runs[0]['model']}` · LLM runs: {len(llm_runs)} · "
        f"similarity model: {project['literature']['embedding_backend']}",
        "",
        "## Summary",
        "",
        "| | Rule-based | LLM (mean of runs) |",
        "|---|---|---|",
        f"| Total /100 | **{rule['total']}** | **{avg_llm['total']}** (σ = {pstdev(totals):.1f}) |",
        f"| Band | {rule['band']} | {avg_llm['band']} |",
        "",
        f"- Agreement: **{cmp['agreement']}** (mean absolute difference {cmp['mean_abs_diff']} points on the 0-10 scale)",
        f"- Same band: {'yes' if cmp['same_band'] else 'no'}; largest disagreement: {cmp['largest_gap']}",
        f"- Rule-based score is deterministic (σ = 0); LLM total varied by σ = {pstdev(totals):.1f} across runs",
        "",
        "## Per dimension",
        "",
        "| Dimension | Weight | Rule | LLM mean | LLM runs | Diff (LLM − rule) |",
        "|---|---|---|---|---|---|",
    ]
    for d, row in zip(rule["dimensions"], cmp["dimensions"]):
        lines.append(
            f"| {d['name']} | {round(d['weight'] * 100)}% | {d['score']} | {row['llm']} | "
            f"{', '.join(str(s) for s in per_dim[d['key']])} | {row['diff']:+.1f} |"
        )

    lines += ["", "## Reasoning (rule-based evidence vs LLM, first run)", ""]
    for d in rule["dimensions"]:
        llm_dim = next(x for x in llm_runs[0]["dimensions"] if x["key"] == d["key"])
        lines += [f"**{d['name']}**", "", f"- Rule: {' '.join(d['reasons'])}", f"- LLM: {llm_dim['reason']}", ""]

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:22]))
    print(f"\nFull report: {OUT}")


if __name__ == "__main__":
    main()
