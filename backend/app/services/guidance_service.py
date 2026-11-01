"""Stage 10 — Publication guidance: readiness and target venue tier.

Deliberately transparent and deterministic (no LLM): it combines results the
student has already seen.

  Readiness   — from the stage 8 paper score plus concrete blockers
                (unanswered questions/aims, unsupported claims, failed
                consistency checks, missing sections).
  Target tier — from a weighted "strength" of paper quality (stage 8),
                research opportunity (stage 4), novelty (stage 4),
                contribution and methodology (stage 8). The thresholds are
                returned with the result so the UI can show them.

`assess_paper` gives the same result for a paper analysed with no project. It
has no stage 4 score, so novelty is measured against the closest papers it
found and the remaining factors carry the opportunity score's weight.

`suggest_venues` names journals and conferences only from where the closest
published papers appeared, so no venue is invented. It says nothing about rank.
"""
import re
from datetime import datetime, timezone
from urllib.parse import quote_plus

from .scoring_service import SIM_RANGE, novelty_space

FACTORS = [  # (key, name, weight, advice for moving up)
    ("paper", "Paper score (stage 8)", 0.35, "Resolve the open issues from stage 8 and upload a revised draft."),
    ("opportunity", "Research Opportunity Score (stage 4)", 0.20, "Refine the idea in stage 6 to target a clearer gap, then re-score."),
    ("novelty", "Novelty space (stage 4)", 0.15, "Sharpen how the work differs from the closest papers; add a comparison against them."),
    ("contribution", "Contribution & novelty of the paper (stage 8)", 0.15, "State the contributions explicitly and show each one with a result."),
    ("methodology", "Methodology of the paper (stage 8)", 0.15, "Strengthen the evaluation: more baselines, repeated runs and a statistical test."),
]

PAPER_FACTORS = [
    ("paper", "Paper score", 0.40, "Resolve the open issues in Score & fixes and upload a revised draft."),
    ("novelty", "Novelty against the closest papers", 0.20, "Sharpen how the work differs from the closest papers; add a comparison against them."),
    ("contribution", "Contribution of the paper", 0.20, "State the contributions explicitly and show each one with a result."),
    ("methodology", "Methodology of the paper", 0.20, "Strengthen the evaluation: more baselines, repeated runs and a statistical test."),
]

TIERS = {
    "top": {"name": "Top-tier venue", "examples": "A*/A-ranked conferences or Q1 journals in your field",
            "rule": "strength ≥ 0.72, novelty ≥ 6/10 and paper score ≥ 75"},
    "mid": {"name": "Mid-tier venue", "examples": "B-ranked conferences, Q2 journals or strong regional conferences",
            "rule": "strength ≥ 0.55"},
    "entry": {"name": "Workshop or student track", "examples": "Workshops at major conferences, student research tracks or undergraduate research symposia",
              "rule": "strength below 0.55"},
}
ORDER = ["entry", "mid", "top"]

READINESS = {
    "ready": "Ready to submit",
    "almost": "Almost ready",
    "revise": "Revise first",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _blockers(paper: dict) -> list[dict]:
    a = paper["analysis"]
    out = []
    for i in a["items"]:
        if i["status"] == "not_answered":
            out.append({"issue": f"Not answered: {i['text'][:140]}", "fix": "Answer it with results or remove it from the paper."})
    for c in a["claims"]:
        if c["status"] == "unsupported":
            out.append({"issue": f"Unsupported claim: {c['claim'][:140]}", "fix": "Back it with a result or tone it down."})
    for c in a["consistency"]:
        if c["status"] == "fail":
            out.append({"issue": f"Consistency check failed: {c['label']}", "fix": c["comment"] or "Fix this before submitting."})
    for s in paper["checks"]["missing_sections"]:
        out.append({"issue": f"Missing section: {s}", "fix": "Add it; reviewers expect the standard structure."})
    return out


def _paper_values(paper: dict) -> dict:
    parts = {p["key"]: p for p in paper["score"]["parts"]}
    return {
        "paper": paper["score"]["total"] / 100,
        "contribution": parts["contribution"]["score"] / parts["contribution"]["max"],
        "methodology": parts["methodology"]["score"] / parts["methodology"]["max"],
    }


def assess(project: dict) -> dict:
    paper, score = project["paper"], project["score"]
    dims = {d["key"]: d for d in score["dimensions"]}
    values = {**_paper_values(paper), "opportunity": score["total"] / 100, "novelty": dims["novelty_space"]["score"] / 10}
    return _result(paper, values, FACTORS)


def assess_paper(paper: dict) -> dict:
    """Readiness and target tier for a paper with no project behind it."""
    novelty = novelty_space(paper["related"])
    result = _result(paper, {**_paper_values(paper), "novelty": novelty["score"] / 10}, PAPER_FACTORS)
    if novelty["signals"].get("measured") is False:
        result["note"] = "No closely related paper was found, so novelty could not be measured and earned no marks. This can hold the tier down."
    return result


def _result(paper: dict, values: dict, factor_list: list) -> dict:
    strength = round(sum(values[k] * w for k, _, w, _ in factor_list), 3)

    blockers = _blockers(paper)
    total = paper["score"]["total"]
    level = "revise" if total < 55 else "ready" if total >= 75 and not blockers else "almost"
    strengths = [p["name"] for p in paper["score"]["parts"] if p["score"] / p["max"] >= 0.75]

    if strength >= 0.72 and values["novelty"] >= 0.6 and values["paper"] >= 0.75:
        tier = "top"
    elif strength >= 0.55:
        tier = "mid"
    else:
        tier = "entry"

    # What exactly is missing for the next tier, so the student knows why they landed here
    requirements = {
        "mid": [("Strength", strength, 0.55)],
        "top": [("Strength", strength, 0.72), ("Novelty space", values["novelty"], 0.6), ("Paper score", values["paper"], 0.75)],
    }
    factors = [{"key": k, "name": name, "weight": w, "value": round(values[k], 3), "contribution": round(values[k] * w, 3)}
               for k, name, w, _ in factor_list]
    weakest = sorted(factor_list, key=lambda f: values[f[0]])[:3]
    next_tier = ORDER[ORDER.index(tier) + 1] if tier != "top" else None
    return {
        "readiness": {"level": level, "label": READINESS[level], "paper_score": total,
                      "blockers": blockers[:8], "strengths": strengths},
        "tier": {"key": tier, **TIERS[tier], "after_revision": level == "revise"},
        "strength": strength,
        "factors": factors,
        "thresholds": {k: v["rule"] for k, v in TIERS.items()},
        "next_tier": {"key": next_tier, "name": TIERS[next_tier]["name"], "rule": TIERS[next_tier]["rule"],
                      "unmet": [{"name": n, "value": round(v, 3), "needed": need} for n, v, need in requirements[next_tier] if v < need]}
                     if next_tier else None,
        "to_move_up": [{"factor": name, "value": round(values[k], 2), "advice": advice} for k, name, _, advice in weakest],
        "based_on": {"paper_file": paper["file"]["name"], "paper_draft": len(paper.get("drafts") or []) + 1,
                     "paper_evaluated_at": paper["evaluated_at"]},
        "method": "rules",
        "assessed_at": _now(),
    }


# ------------------------------------------------------------------ named journals and conferences
MAX_VENUES = 5
CONFERENCE_NAME = r"\b(conferences?|proceedings|symposium|workshop)\b"  # OpenAlex lists some proceedings as journals


def _rank_url(name: str, kind: str) -> str:
    if kind == "journal":
        return f"https://www.scimagojr.com/journalsearch.php?q={quote_plus(name)}"
    short = re.search(r"\(([A-Z][A-Za-z0-9-]{2,})\)\s*$", name)  # CORE finds "INFOCOM", not always the full name
    return f"https://portal.core.edu.au/conf-ranks/?search={quote_plus(short.group(1) if short else name)}&by=all&source=all"


def suggest_venues(papers: list[dict], backend: str | None) -> dict:
    """Where the papers closest to this one appeared. `papers` carry their similarity, closest first.

    A journal must be on OpenAlex's core list, which leaves out the many journals that
    publish anything. OpenAlex does not assess conferences, so those are only listed.
    """
    lo, hi = SIM_RANGE.get(backend, SIM_RANGE["tfidf"])
    close_enough = lo + 0.2 * (hi - lo)  # about 0.5 with embeddings: unrelated papers say nothing about fit
    found: dict[str, dict] = {}
    for p in papers:
        name, kind = (p.get("venue") or "").strip(), p.get("venue_type")
        if not name or p["similarity"] < close_enough:
            continue
        if kind == "conference" or (kind == "journal" and re.search(CONFERENCE_NAME, name, re.I)):
            kind = "conference"
        elif kind != "journal" or not p.get("venue_core"):
            continue
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        if key in found:
            found[key]["papers"] += 1
        else:
            found[key] = {"name": name[:160], "kind": kind, "papers": 1, "rank_url": _rank_url(name, kind),
                          "closest": {"title": p["title"], "year": p.get("year"), "url": p.get("url") or "", "similarity": round(p["similarity"], 3)}}
    ranked = sorted(found.values(), key=lambda v: (-v["papers"], -v["closest"]["similarity"]))
    return {kind: [v for v in ranked if v["kind"] == one][:MAX_VENUES] for kind, one in (("journals", "journal"), ("conferences", "conference"))}
