"""Apply the current scoring rules to every saved project, in place.

Re-running the score stage would clear the refinement, plan and paper that come
after it, so this only replaces the numbers. Text the AI wrote, such as gaps and
research questions, stays because later stages refer to it. Only the score
explanation is rewritten, because it quotes the total. Uploaded files are not
stored, so paper parts judged from the file keep their marks and only the parts
that can be worked out from the saved analysis change. A saved paper result that
would now be refused as not a research paper is removed from its project.
Modified dates stay as they are.

Uses SUPABASE_SECRET_KEY, so it reads every account. Run from backend/:

    python -m scripts.rescore_saved                 # shows the changes
    python -m scripts.rescore_saved --apply BACKUP  # saves a JSON backup, then writes
"""
import copy
import json
import sys

import httpx

from app.config import settings
from app.services import guidance_service, llm_scoring_service, llm_service, paper_service, scoring_service, versions_service
from app.services.pipeline import SYSTEM, project_text


def _headers() -> dict:
    key = settings.SUPABASE_SECRET_KEY
    return {"apikey": key, **({} if key.startswith("sb_") else {"Authorization": f"Bearer {key}"})}


def _new_explanation(data: dict, score: dict) -> str | None:
    dims = "\n".join(f"- {d['name']}: {d['score']}/10 ({' '.join(d['reasons'])})" for d in score["dimensions"])
    papers = "\n".join(f"- {p['title']} ({p.get('year')}), sim {p['similarity']}" for p in data["literature"]["papers"][:8])
    prompt = f"""PROJECT:
{project_text(data)[:3000]}

RESEARCH OPPORTUNITY SCORE: {score['total']} out of 100 ({score['band']}). Dimension scores are out of 10.
{dims}

CLOSEST RELATED PAPERS:
{papers}

Using ONLY this evidence, return JSON with one key, "explanation": 3-4 sentences explaining the score to a student
(refer to the overall score as "/100"). Do not claim the idea is novel."""
    try:
        return str(llm_service.complete_json(SYSTEM, prompt, 500)["explanation"])
    except (llm_service.LLMUnavailable, KeyError):
        return None


def _rescore_paper(paper: dict) -> None:
    analysis = paper["analysis"]
    for check in analysis["consistency"]:  # "warn" with no comment was the old default for a missing verdict
        if check["status"] == "warn" and not check.get("comment"):
            check.update(status="fail", comment="This check got no verdict, so it earns no marks.")
    counts = paper_service.analysis_counts(analysis)
    worth = {"questions": "items", "claims": "claims", "consistency": "consistency"}
    for part in paper["score"]["parts"]:
        if part["key"] in worth:
            got, total = counts[worth[part["key"]]]
            part["score"] = round(got / total * part["max"], 1) if total else 0
    paper["score"]["total"] = total = round(sum(p["score"] for p in paper["score"]["parts"]), 1)
    paper["score"]["band"] = "Strong" if total >= 75 else "Adequate" if total >= 55 else "Weak"


def _not_a_paper(paper: dict) -> str | None:
    """Files are not stored, so saved results are judged from what was recorded about them."""
    keys = {o["key"] for o in paper.get("outline") or []}
    if len(keys & {"abstract", "results", "references"}) == 3 and keys & {"method", "experiments"} and paper["references"]["count"] >= 5:
        return None  # a full paper structure outweighs the AI's verdict, as in require_research_paper
    about = paper.get("about") or {}
    outline = ", ".join(f"{o['title']} ({o['words']} words)" for o in paper.get("outline") or [])
    text = (f"File name: {paper['file']['name']}\nTitle: {about.get('title')}\nSummary: {about.get('summary') or paper.get('summary')}\n"
            f"Sections: {outline}\nStated items: {[i['text'][:80] for i in paper['analysis']['items']][:5]}")
    try:
        verdict = paper_service._llm_classify(text, [])
    except llm_service.LLMUnavailable:
        return None
    return f"{verdict.get('document_type')}: {verdict.get('reason')}" if verdict.get("is_research_paper") is False else None


def _rescore(data: dict, apply: bool, notes: list[str]) -> list[str]:
    """Updates one version in place and returns what changed."""
    changes = []
    saved = data.get("paper")
    if saved and saved.get("analysis"):
        reason = _not_a_paper(saved)
        if reason and saved.get("standalone"):
            notes.append(f"possible non-paper, move it to the trash: {data.get('title')}")
        elif reason:
            changes.append(f"paper result removed, {saved['file']['name']} is not a paper ({reason[:140]})")
            data["paper"] = data["guidance"] = None
    score, prof, lit = data.get("score"), data.get("profile"), data.get("literature")
    if score and prof and lit and lit.get("papers") is not None:
        new = scoring_service.compute_score(prof["profile"], prof.get("repository"), data.get("idea_text") or "", lit)
        changes.append(f"ROS {score.get('total')} {score.get('band')} -> {new['total']} {new['band']}")
        changed = new["total"] != score.get("total")
        score.update(new)
        if score.get("llm_score"):
            score["comparison"] = llm_scoring_service.compare(score, score["llm_score"])
        if changed and apply and score.get("explanation"):
            text = _new_explanation(data, score)
            if text:
                score["explanation"] = text
            else:
                notes.append(f"explanation not rewritten: {data.get('title')}")
    paper = data.get("paper")
    if paper and paper.get("analysis") and paper.get("score"):
        before = (paper["score"]["total"], paper["score"]["band"])
        _rescore_paper(paper)
        changes.append(f"paper {before[0]} {before[1]} -> {paper['score']['total']} {paper['score']['band']}")
        if paper.get("standalone"):
            paper["guidance"] = guidance_service.assess_paper(paper)
            changes.append(f"target tier {paper['guidance']['tier']['name']}")
    guidance = data.get("guidance")
    if guidance and score and paper and paper.get("analysis") and score.get("dimensions"):
        old = (guidance.get("tier") or {}).get("name"), (guidance.get("readiness") or {}).get("label")
        data["guidance"] = guidance_service.assess(data)
        changes.append(f"guidance {old[0]}, {old[1]} -> {data['guidance']['tier']['name']}, {data['guidance']['readiness']['label']}")
    return changes


def _bad_accounts() -> list[str]:
    r = httpx.get(f"{settings.SUPABASE_URL}/auth/v1/admin/users", headers=_headers(), params={"per_page": 1000}, timeout=30.0)
    r.raise_for_status()
    from app.auth import valid_email
    return [u.get("email") or "(no email)" for u in r.json().get("users", []) if not valid_email(u.get("email") or "")]


def main() -> None:
    apply = "--apply" in sys.argv
    if apply and len(sys.argv) < 3:
        sys.exit("Give a path for the backup: python -m scripts.rescore_saved --apply BACKUP")
    if not (settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY):
        sys.exit("Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env first")
    base = f"{settings.SUPABASE_URL}/rest/v1/projects"
    r = httpx.get(base, headers=_headers(), params={"select": "*", "order": "created_at.asc"}, timeout=60.0)
    r.raise_for_status()
    rows = r.json()
    if apply:
        with open(sys.argv[2], "w", encoding="utf8") as f:
            json.dump(rows, f)
        print(f"Backup of {len(rows)} rows saved")

    notes: list[str] = []
    written = 0
    for row in rows:
        before = copy.deepcopy({k: row.get(k) for k in ("score", "paper", "guidance", "history", "stage")})
        print(f"\n{row['title'][:70]}{' [trash]' if row.get('deleted_at') else ''}")
        for change in _rescore(row, apply, notes) or ["nothing to rescore"]:
            print("  ", change)
        history = row.get("history")
        if isinstance(history, dict):
            for version in history.get("versions", []):
                for change in _rescore(version, apply, notes):
                    print(f"   v{version.get('version')}: {change}")
        elif history:
            print("   older compact version summaries stay as they were")
        if before["paper"] and not row.get("paper"):
            row["stage"] = versions_service.stage_of(row)
        after = {k: row.get(k) for k in before}
        update = {k: v for k, v in after.items() if v != before[k]}
        if apply and update:
            w = httpx.patch(base, headers=_headers(), params={"id": f"eq.{row['id']}"}, json=update, timeout=60.0)
            w.raise_for_status()
            written += 1

    print(f"\n{len(rows)} rows read, {written} written{'' if apply else ' (preview only)'}")
    for note in notes:
        print("NOTE:", note)
    bad = _bad_accounts()
    print(f"Accounts with an invalid email: {bad or 'none'}")


if __name__ == "__main__":
    main()
