"""LLM-judged Research Opportunity Score, for comparison with the rule-based score.

The LLM receives the same evidence the formulas use (profile, repository
signals, ranked papers, literature statistics) and the same rubric, but NOT
the rule-based numbers, so its judgement is independent. Both totals use the
same dimension weights, which makes them directly comparable.
"""
from . import llm_service, scoring_service
from .profile_service import SYSTEM

RUBRIC = {
    "novelty_space": "How much room the literature leaves. 10 = little overlap with existing work, "
                     "0 = the idea is already well covered by the papers below.",
    "technical_depth": "Algorithmic / engineering depth and number of non-trivial techniques.",
    "feasibility": "How realistic it is for a student team to run convincing experiments "
                   "(existing code, data, evaluation plan, reusable baselines).",
    "impact": "How active and important the research area is and how much the result would matter.",
    "reproducibility": "How easily others could reproduce the work (code, dependencies, tests, CI, docs, licence). "
                       "If there is no code, score 0.",
    "contribution": "Overall potential for a distinct, publishable contribution.",
}


def build_evidence(project: dict) -> str:
    prof = project["profile"]["profile"]
    repo = project["profile"]["repository"]
    lit = project["literature"]
    stats = lit["stats"]

    lines = [
        f"TITLE: {project['title']}",
        f"IDEA: {project['idea_text'] or '(none)'}",
        f"SUMMARY: {prof.get('summary', '')}",
        f"PROBLEM: {prof.get('problem', '')}",
        f"APPROACH: {prof.get('approach', '')}",
        f"TECHNIQUES: {', '.join(prof.get('techniques', []))}",
    ]
    if repo:
        s = repo["signals"]
        lines += [
            f"REPOSITORY: {repo['owner']}/{repo['name']} - {repo['stars']} stars, {repo['forks']} forks, "
            f"{repo['code_file_count']} code files, languages: {', '.join(repo['languages'])}, "
            f"{sum(len(v) for v in repo['dependencies'].values())} dependencies, licence: {repo.get('license')}",
            "REPO SIGNALS: " + ", ".join(f"{k.replace('has_', '')}={'yes' if v else 'no'}" for k, v in s.items())
            + f", readme_length={repo.get('readme_length', 0)} chars",
        ]
    else:
        lines.append("REPOSITORY: none (idea only, no code yet)")

    cites = stats["median_citations"]
    lines += [
        f"LITERATURE: {stats['total']} related papers retrieved, years {stats['year_min']}-{stats['year_max']}, "
        f"{round(stats['recent_share'] * 100)}% from the last 3 years, median citations: "
        f"{'unknown' if cites is None else cites}",
        f"SIMILARITY: cosine similarity from a sentence-embedding model ({lit['embedding_backend']}); "
        "above 0.80 = near-identical topic, 0.60-0.80 = closely related, below 0.50 = loosely related.",
        "CLOSEST PAPERS:",
    ]
    for p in lit["papers"][:8]:
        lines.append(
            f"- [{p['similarity']:.2f}] {p['title']} ({p.get('year')}, "
            f"{'n/a' if p.get('citations') is None else p['citations']} citations): {p['abstract'][:300]}"
        )
    return "\n".join(lines)


def llm_score(project: dict) -> dict:
    rubric = "\n".join(
        f'- "{k}" ({scoring_service.DIMENSIONS[k][0]}): {desc}' for k, desc in RUBRIC.items()
    )
    prompt = f"""Judge the research opportunity of this project using ONLY the evidence below.

{build_evidence(project)}

Score each dimension from 0 to 10 (one decimal allowed). 0-3 = weak, 4-6 = moderate, 7-10 = strong.
Marks must be earned: when the evidence shows nothing for a dimension, score 0, never a middle value by default.
Use the full range and be critical; do not default to middle values.
{rubric}

Return JSON: {{"dimensions": {{"<key>": {{"score": <number>, "reason": "<one sentence citing the evidence>"}}, ...}}}}
with exactly these keys: {", ".join(RUBRIC)}."""

    data = llm_service.complete_json(SYSTEM, prompt, 1500)
    raw = data.get("dimensions", data)

    dims = []
    for key in RUBRIC:
        item = raw.get(key)
        if not isinstance(item, dict) or "score" not in item:
            raise llm_service.LLMUnavailable(f"LLM score missing dimension '{key}'")
        try:
            value = max(0.0, min(10.0, float(item["score"])))
        except (TypeError, ValueError) as e:
            raise llm_service.LLMUnavailable(f"LLM score for '{key}' is not a number") from e
        name, weight = scoring_service.DIMENSIONS[key]
        dims.append({"key": key, "name": name, "weight": weight, "score": round(value, 1),
                     "reason": str(item.get("reason", ""))})

    total = round(sum(d["score"] * d["weight"] for d in dims) * 10, 1)
    return {"total": total, "band": scoring_service.band(total), "dimensions": dims,
            "model": llm_service.status()["model"]}


def compare(rule: dict, llm: dict) -> dict:
    """Per-dimension and overall agreement between the two scores."""
    llm_by_key = {d["key"]: d for d in llm["dimensions"]}
    rows = []
    for d in rule["dimensions"]:
        l = llm_by_key[d["key"]]["score"]
        rows.append({"key": d["key"], "name": d["name"], "rule": d["score"], "llm": l,
                     "diff": round(l - d["score"], 1)})
    mae = round(sum(abs(r["diff"]) for r in rows) / len(rows), 2)
    total_diff = round(llm["total"] - rule["total"], 1)
    if mae <= 1.0:
        agreement = "Strong agreement"
    elif mae <= 2.0:
        agreement = "Moderate agreement"
    else:
        agreement = "Weak agreement"
    return {
        "dimensions": rows,
        "mean_abs_diff": mae,
        "total_diff": total_diff,
        "same_band": rule["band"] == llm["band"],
        "agreement": agreement,
        "largest_gap": max(rows, key=lambda r: abs(r["diff"]))["name"],
    }
