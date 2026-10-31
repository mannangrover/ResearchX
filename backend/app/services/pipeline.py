"""Orchestrates the prototype stages:

  2. Project analysis      -> run_analysis()
  3. Literature analysis   -> run_literature()
  4. Opportunity score     -> run_scoring()   (also produces
  5. Research gaps            gaps + suggested modifications)
"""
import json
import re
from datetime import date

from ..config import settings
from . import llm_scoring_service, llm_service, scoring_service
from .literature_service import retrieve_papers
from .profile_service import SYSTEM, build_profile
from .similarity_service import score_papers, shared_terms


def project_text(project: dict) -> str:
    prof = (project.get("profile") or {}).get("profile", {})
    repo = (project.get("profile") or {}).get("repository") or {}
    parts = [
        project["title"], project["idea_text"],
        prof.get("summary", ""), prof.get("problem", ""), prof.get("approach", ""),
        " ".join(prof.get("techniques", [])), " ".join(prof.get("keywords", []) * 2),
        repo.get("description", ""), " ".join(repo.get("topics", [])),
    ]
    return " ".join(p for p in parts if p)


# ---------------------------------------------------------------- stage 2
def run_analysis(project: dict) -> dict:
    return build_profile(project["title"], project["idea_text"], project["github_url"], project["domain"])


# ---------------------------------------------------------------- stage 3
def _compare_with_llm(project: dict, papers: list[dict]) -> None:
    """Adds a one-line 'relation' to each of the top papers (in place)."""
    listing = "\n".join(
        f"[{i}] {p['title']} ({p.get('year')}): {p['abstract'][:600]}" for i, p in enumerate(papers)
    )
    prompt = f"""PROJECT:
{project_text(project)[:3000]}

RELATED PAPERS:
{listing}

For each paper, explain in one sentence how it relates to the project and in one sentence how the project differs.
Return JSON: {{"comparisons": [{{"index": 0, "relation": "...", "difference": "..."}}, ...]}}"""
    data = llm_service.complete_json(SYSTEM, prompt, 1800)
    for c in data.get("comparisons", []):
        i = c.get("index")
        if isinstance(i, int) and 0 <= i < len(papers):
            papers[i]["relation"] = c.get("relation", "")
            papers[i]["difference"] = c.get("difference", "")


def run_literature(project: dict, queries: list[str] | None = None) -> dict:
    prof = project["profile"]["profile"]
    queries = [q for q in (queries or prof.get("search_queries") or []) if q.strip()] or [project["title"]]

    result = retrieve_papers(queries)
    papers = [p for p in result["papers"] if p.get("abstract")] or result["papers"]
    text = project_text(project)
    sims, backend = score_papers(text, papers)
    for p, s in zip(papers, sims):
        p["similarity"] = round(s, 3)
        p["shared_terms"] = shared_terms(text, p)
    papers.sort(key=lambda p: -p["similarity"])

    stats = scoring_service.literature_stats(papers)
    top = papers[: settings.TOP_K_PAPERS]

    method, note = "heuristic", None
    try:
        _compare_with_llm(project, top[:8])
        method = "llm"
    except llm_service.LLMUnavailable as e:
        note = str(e)

    return {
        "queries": queries,
        "papers": top,
        "stats": stats,
        "retrieved_per_source": result["retrieved_per_source"],
        "embedding_backend": backend,
        "errors": result["errors"],
        "method": method,
        "note": note,
    }


# ---------------------------------------------------------------- stage 4 + 5
def _heuristic_gaps(project: dict, score: dict, lit: dict) -> dict:
    prof = project["profile"]["profile"]
    dims = {d["key"]: d for d in score["dimensions"]}
    papers = lit["papers"]
    gaps, mods = [], []

    techniques = prof.get("techniques", [])
    if len(techniques) >= 2 and papers:
        corpus = " ".join((p["title"] + " " + p["abstract"]).lower() for p in papers)
        for a, b in [(techniques[i], techniques[j]) for i in range(len(techniques)) for j in range(i + 1, len(techniques))][:6]:
            ka, kb = a.split("(")[0].strip().lower(), b.split("(")[0].strip().lower()
            if ka in corpus and kb in corpus:
                continue
            gaps.append({
                "title": f"Combination: {a} + {b}",
                "description": f"None of the top related papers mention both {a} and {b}. Studying them together may be an unexplored combination.",
                "evidence": f"Checked {len(papers)} top-ranked abstracts.",
            })
            break

    if papers:
        p = papers[0]
        high = dims["novelty_space"]["signals"].get("overlap_level") == "high"
        gaps.append({
            "title": "Differentiate from the closest work" if high else "Position against the closest work",
            "description": (
                f"“{p['title']}” is {'very close' if high else 'the nearest related paper'}. "
                "Use it as a baseline and target a setting it does not cover (new domain, dataset, scale or constraint)."
            ),
            "evidence": f"Similarity {p['similarity']:.2f}; shared terms: {', '.join(p.get('shared_terms', [])) or 'none'}.",
        })
        if high:
            mods.append("Narrow the problem to a domain, dataset or constraint the closest paper does not address.")

    recent = [q for q in papers if q.get("year") and q["year"] >= date.today().year - 1]
    if len(recent) >= 3:
        gaps.append({
            "title": "Fast-moving area — build on the newest results",
            "description": f"{len(recent)} of the top papers are from the last two years. Comparing against these recent methods strengthens the contribution.",
            "evidence": "; ".join(q["title"][:70] for q in recent[:3]),
        })

    if not dims["feasibility"]["signals"].get("mentions_evaluation"):
        gaps.append({
            "title": "Missing quantitative evaluation",
            "description": "Define datasets, baselines and metrics; an empirical comparison against 2–3 related systems is itself a publishable contribution.",
            "evidence": "No dataset/metric terms found in the description.",
        })
        mods.append("Add a benchmark: pick a public dataset and 2–3 baselines from the related-work list.")

    if dims["reproducibility"]["score"] < 5:
        mods.append("Improve reproducibility: tests, pinned dependencies, and a one-command run script.")
    if dims["technical_depth"]["score"] < 5:
        mods.append("Increase technical depth: add a learned or algorithmic component and an ablation study.")

    rq = [f"How does the proposed approach compare with “{papers[0]['title']}” on a shared benchmark?"] if papers else []
    rq.append(f"Which component of {project['title']} contributes most to performance (ablation)?")

    return {
        "explanation": (
            f"ResearchX estimates a {score['band'].lower()} research opportunity ({score['total']}/100). "
            f"Strongest dimension: {max(score['dimensions'], key=lambda d: d['score'])['name'].lower()}; "
            f"weakest: {min(score['dimensions'], key=lambda d: d['score'])['name'].lower()}."
        ),
        "gaps": gaps,
        "modifications": mods,
        "research_questions": rq,
    }


def _llm_gaps(project: dict, score: dict, lit: dict) -> dict:
    dims = "\n".join(f"- {d['name']}: {d['score']}/10 ({' '.join(d['reasons'])})" for d in score["dimensions"])
    papers = "\n".join(f"- {p['title']} ({p.get('year')}), sim {p['similarity']}: {p['abstract'][:400]}" for p in lit["papers"][:8])
    prompt = f"""PROJECT:
{project_text(project)[:3000]}

RESEARCH OPPORTUNITY SCORE: {score['total']} out of 100 ({score['band']}). Dimension scores are out of 10.
{dims}

CLOSEST RELATED PAPERS:
{papers}

Using ONLY this evidence:
1. "explanation": 3-4 sentences explaining the score to a student (refer to the overall score as "/100"). Do not claim the idea is novel.
2. "gaps": 3-5 research gaps, each {{"title", "description", "evidence"}} where evidence cites the papers or signals above.
3. "modifications": 2-4 technically meaningful changes that would raise the research potential.
4. "research_questions": 2-3 concrete research questions.
Return JSON with exactly those keys."""
    data = llm_service.complete_json(SYSTEM, prompt, 1800)
    if not {"explanation", "gaps"} <= data.keys():
        raise llm_service.LLMUnavailable("LLM gap analysis missing fields")
    def as_text(item) -> str:
        if isinstance(item, dict):
            title, desc = item.get("title", ""), item.get("description") or item.get("question") or ""
            return f"{title}: {desc}" if title and desc else title or desc or json.dumps(item)
        return str(item)

    gaps = []
    for g in data.get("gaps") or []:
        if isinstance(g, dict):
            gaps.append({k: as_text(g.get(k, "")) for k in ("title", "description", "evidence")})
        else:
            gaps.append({"title": str(g), "description": "", "evidence": ""})
    return {
        "explanation": as_text(data["explanation"]),
        "gaps": gaps,
        "modifications": [as_text(m) for m in data.get("modifications") or []],
        "research_questions": [as_text(q) for q in data.get("research_questions") or []],
    }


def run_scoring(project: dict) -> dict:
    prof_stage = project["profile"]
    lit = project["literature"]
    score = scoring_service.compute_score(prof_stage["profile"], prof_stage["repository"], project["idea_text"], lit)

    # Independent LLM judgement of the same dimensions, for comparison with the formulas
    llm_judgement, comparison, llm_score_note = None, None, None
    try:
        llm_judgement = llm_scoring_service.llm_score(project)
        comparison = llm_scoring_service.compare(score, llm_judgement)
    except llm_service.LLMUnavailable as e:
        llm_score_note = str(e)

    method, note = "heuristic", None
    try:
        analysis = _llm_gaps(project, score, lit)
        method = "llm"
    except llm_service.LLMUnavailable as e:
        analysis = _heuristic_gaps(project, score, lit)
        note = str(e)

    return {**score, **analysis, "method": method, "note": note,
            "llm_score": llm_judgement, "comparison": comparison, "llm_score_note": llm_score_note,
            "disclaimer": "Decision-support estimate only. It does not guarantee novelty or publication."}


def clean_url(url: str) -> str:
    return re.sub(r"\s+", "", url or "")
