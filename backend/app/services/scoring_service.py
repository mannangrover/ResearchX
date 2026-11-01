"""Stage 4 — Research Opportunity Score (ROS).

The score is deliberately transparent: every dimension is computed from
measurable signals (literature similarity, repository structure, field
activity) and carries the reasons that produced it. The LLM is only used
to explain the result, never to invent the numbers. Every dimension starts at
0: marks come only from evidence, and missing evidence earns nothing.
"""
import math
import re
from datetime import date
from statistics import median

DIMENSIONS = {
    # key: (display name, weight)
    "novelty_space": ("Literature overlap (novelty space)", 0.25),
    "technical_depth": ("Technical depth", 0.15),
    "feasibility": ("Feasibility", 0.15),
    "impact": ("Potential impact", 0.15),
    "reproducibility": ("Reproducibility", 0.10),
    "contribution": ("Contribution potential", 0.20),
}

# Similarity ranges differ a lot between TF-IDF and dense embeddings
SIM_RANGE = {"tfidf": (0.03, 0.25), "sentence-transformers": (0.40, 0.92), "gemini": (0.40, 0.92)}

EVAL_TERMS = r"\b(dataset|benchmark|evaluat\w*|accuracy|f1|precision|recall|baseline|metric\w*|experiment\w*|latency|throughput|user study)\b"
ML_HINTS = ("learning", "neural", "transformer", "llm", "embedding", "vision", "nlp", "graph", "reinforcement", "rag")


def _clip(x: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return round(max(lo, min(hi, x)), 1)


def _norm(x: float, lo: float, hi: float) -> float:
    return max(0.0, min(1.0, (x - lo) / (hi - lo))) if hi > lo else 0.0


def _dim(key: str, score: float, reasons: list[str], signals: dict) -> dict:
    name, weight = DIMENSIONS[key]
    return {"key": key, "name": name, "weight": weight, "score": _clip(score), "reasons": reasons, "signals": signals}


def novelty_space(lit: dict) -> dict:
    papers = lit["papers"]
    if not papers:
        return _dim("novelty_space", 0, ["No related papers could be retrieved, so novelty cannot be measured and earns no marks."], {"measured": False})
    lo, hi = SIM_RANGE.get(lit["embedding_backend"], SIM_RANGE["tfidf"])
    sims = [p["similarity"] for p in papers]
    top = papers[0]
    top5 = sum(sims[:5]) / min(5, len(sims))
    if sims[0] < lo:
        # A search that found nothing relevant is not evidence of novelty
        return _dim("novelty_space", 0, [f"No closely related paper was found (closest similarity {sims[0]:.2f}), so novelty cannot be measured "
                                         "and earns no marks. Describe the idea more specifically or refine the search queries."],
                    {"measured": False, "max_similarity": round(sims[0], 3), "top5_mean_similarity": round(top5, 3)})
    overlap = 0.6 * _norm(sims[0], lo, hi) + 0.4 * _norm(top5, lo, hi)
    level = "high" if overlap > 0.66 else "moderate" if overlap > 0.33 else "low"
    reasons = [
        f"Closest paper: “{top['title']}” ({top.get('year') or 'n.d.'}), similarity {sims[0]:.2f}.",
        f"Mean similarity of the top-5 papers is {top5:.2f} → {level} overlap with existing work.",
    ]
    if level == "high":
        reasons.append("Much of this idea appears in prior work; a clear differentiator is needed.")
    score = 10 * (1 - overlap)
    if level == "low":
        # Very low similarity often means retrieval missed the field rather than true novelty,
        # so the score is capped instead of rewarding a possibly failed search.
        score = min(score, 7.5)
        reasons.append("Little direct overlap found — this may mean the searches missed the field, "
                       "so the score is capped at 7.5. Verify manually or refine the queries.")
    return _dim("novelty_space", score, reasons,
                {"max_similarity": round(sims[0], 3), "top5_mean_similarity": round(top5, 3), "overlap_level": level})


def technical_depth(profile: dict, repo: dict | None, idea: str) -> dict:
    techniques = profile.get("techniques", [])
    reasons, score = [], 0.0
    t_pts = min(3.5, 0.7 * len(techniques))
    score += t_pts
    if techniques:
        reasons.append(f"{len(techniques)} techniques identified: {', '.join(techniques[:5])}.")
    ml = any(h in " ".join(techniques + profile.get("keywords", [])).lower() for h in ML_HINTS)
    if ml:
        score += 1
        reasons.append("Involves learning-based / AI methods, which usually support experimental depth.")
    signals = {"technique_count": len(techniques), "ml_component": ml}
    if repo:
        code = repo["code_file_count"]
        n_deps = sum(len(v) for v in repo["dependencies"].values())
        code_pts = min(3.0, 3 * math.log10(1 + code) / math.log10(201))
        lang_pts = min(1.5, 0.5 * len(repo["languages"]))
        dep_pts = min(1.0, n_deps / 25)
        score += code_pts + lang_pts + dep_pts
        reasons.append(f"Repository has {code} source files in {len(repo['languages'])} language(s) and {n_deps} declared dependencies.")
        signals.update(code_files=code, languages=len(repo["languages"]), dependencies=n_deps)
    else:
        # Length alone proves nothing: a longer description only counts when it names techniques
        words = len(idea.split())
        if techniques:
            score += min(2.5, words / 80)
        reasons.append(f"Idea-only submission ({words} words); depth estimated from the techniques it names."
                       if techniques else "No techniques identified, so no depth could be shown.")
    return _dim("technical_depth", score, reasons, signals)


def feasibility(repo: dict | None, idea: str, lit: dict) -> dict:
    score, reasons = 0.0, []
    mentions_eval = bool(re.search(EVAL_TERMS, idea, re.I))
    if repo:
        if repo["code_file_count"] >= 5:
            score += 4
            reasons.append("A working code base already exists, so experiments can start immediately.")
        if repo["signals"]["has_dependency_file"]:
            score += 2
            reasons.append("Dependencies are declared, so the environment is reproducible.")
        if repo["signals"]["has_license"]:
            score += 0.5
    else:
        reasons.append("No repository yet — implementation effort must be planned.")
    if mentions_eval:
        score += 2.5
        reasons.append("The description mentions datasets/metrics/evaluation.")
    else:
        reasons.append("No dataset or evaluation metric mentioned yet.")
    open_access = sum(1 for p in lit["papers"] if p.get("arxiv_id"))
    if open_access >= 3:
        score += 1
        reasons.append(f"{open_access} related papers are open-access on arXiv (easy to reuse baselines).")
    return _dim("feasibility", score, reasons, {"mentions_evaluation": mentions_eval, "open_access_papers": open_access})


def impact(lit: dict, repo: dict | None) -> dict:
    stats = lit["stats"]
    recent, cites = stats["recent_share"], stats["median_citations"]
    reasons = [
        f"{round(recent * 100)}% of related papers were published in the last 3 years "
        f"({'an active' if recent >= 0.4 else 'a slower-moving'} area).",
    ]
    if cites is None:
        cite_pts = 0.0
        reasons.append("Citation counts unavailable for the retrieved papers, so they earn no marks.")
    else:
        cite_pts = min(3.0, math.log10(1 + cites) * 1.2)
        reasons.append(f"Median citation count of related work: {cites:g}.")
    score = 6 * recent + cite_pts
    if repo and repo["stars"]:
        score += min(1.0, math.log10(1 + repo["stars"]) / 3)
        reasons.append(f"Repository has {repo['stars']} GitHub stars.")
    return _dim("impact", score, reasons, {"recent_share": recent, "median_citations": cites})


def reproducibility(repo: dict | None) -> dict:
    if not repo:
        return _dim("reproducibility", 0, ["No code submitted yet, so there is nothing to reproduce and no marks. Submit a repository to earn them."], {})
    s = repo["signals"]
    checks = [
        ("README is detailed", repo.get("readme_length", 0) > 1500, 2.0),
        ("dependency file", s["has_dependency_file"], 2.0),
        ("automated tests", s["has_tests"], 2.0),
        ("CI workflow", s["has_ci"], 1.5),
        ("licence", s["has_license"], 1.0),
        ("Dockerfile", s["has_dockerfile"], 1.0),
        ("docs folder", s["has_docs"], 0.5),
    ]
    score = sum(w for _, ok, w in checks if ok)
    have = [n for n, ok, _ in checks if ok]
    missing = [n for n, ok, _ in checks if not ok]
    reasons = []
    if have:
        reasons.append("Present: " + ", ".join(have) + ".")
    if missing:
        reasons.append("Missing: " + ", ".join(missing) + ".")
    return _dim("reproducibility", score, reasons, {n: ok for n, ok, _ in checks})


def contribution(nov: dict, imp: dict, depth: dict) -> dict:
    score = 0.5 * nov["score"] + 0.3 * imp["score"] + 0.2 * depth["score"]
    reasons = ["Combines room in the literature (50%), field activity (30%) and technical depth (20%)."]
    if nov["score"] >= 6 and imp["score"] >= 5:
        reasons.append("Active field with room for a distinct contribution — a good position.")
    elif nov["score"] < 4 and nov["signals"].get("measured", True):
        reasons.append("High overlap limits contribution unless the project is modified.")
    return _dim("contribution", score, reasons, {})


def band(total: float) -> str:
    if total >= 70:
        return "Strong"
    if total >= 50:
        return "Moderate"
    if total >= 35:
        return "Limited"
    return "Weak"


def compute_score(profile: dict, repo: dict | None, idea: str, lit: dict) -> dict:
    nov = novelty_space(lit)
    depth = technical_depth(profile, repo, idea)
    imp = impact(lit, repo)
    dims = [nov, depth, feasibility(repo, idea, lit), imp, reproducibility(repo), contribution(nov, imp, depth)]
    total = round(sum(d["score"] * d["weight"] for d in dims) * 10, 1)
    return {"total": total, "band": band(total), "dimensions": dims}


def literature_stats(papers: list[dict]) -> dict:
    years = [p["year"] for p in papers if p.get("year")]
    cites = [p["citations"] for p in papers if p.get("citations") is not None]
    this_year = date.today().year
    return {
        "total": len(papers),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "recent_share": round(sum(1 for y in years if y >= this_year - 3) / len(years), 2) if years else 0.0,
        "median_citations": median(cites) if cites else None,  # arXiv has no citation counts
    }
