"""Project versions — every version of a project lives inside that one project.

The *working* version is stored in the normal columns (title, idea_text,
profile, literature, score, refinement, plan, paper). Every other version is a
full snapshot in projects.history:

    {"current": 3, "current_parent": 2, "current_label": "Refined",
     "versions": [{"version": 1, "parent": None, "label": "Original",
                   "title", "idea_text", "profile", "literature", "score",
                   "refinement", "plan", "paper", "guidance", "saved_at"}, ...]}

Applying a refined proposal *branches* a new version from the working one;
switching swaps the working version with a stored one, so nothing is lost.
Rows written before full snapshots existed stored a plain list of compact
summaries; `load` upgrades them and marks them `legacy` (view-only summary).
"""
from datetime import datetime, timezone

from fastapi import HTTPException

STAGE_DATA = ("profile", "literature", "score", "refinement", "plan", "paper", "guidance")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load(project: dict) -> dict:
    history = project.get("history")
    if isinstance(history, list):  # legacy shape: list of compact snapshots
        versions = [{**v, "legacy": True, "label": "Original" if i == 0 else "Refined",
                     "parent": v["version"] - 1 or None} for i, v in enumerate(history)]
        return {"current": len(history) + 1, "current_parent": history[-1]["version"] if history else None,
                "current_label": "Refined" if history else "Original", "versions": versions}
    return history or {"current": 1, "current_parent": None, "current_label": "Original", "versions": []}


def stage_of(data: dict) -> int:
    """Highest completed stage of a version, from the data it holds."""
    if data.get("guidance"):
        return 10
    if data.get("paper"):
        return 8
    if data.get("plan"):
        return 7
    if (data.get("refinement") or {}).get("approved"):
        return 6
    for stage, key in ((4, "score"), (3, "literature"), (2, "profile")):
        if data.get(key):
            return stage
    return 1


def snapshot(project: dict, meta: dict) -> dict:
    """Full copy of the working version, ready to be stored in history."""
    return {
        "version": meta["current"], "parent": meta.get("current_parent"), "label": meta.get("current_label"),
        "title": project["title"], "idea_text": project["idea_text"],
        **{k: project.get(k) for k in STAGE_DATA},
        "saved_at": _now(),
    }


def _sorted(versions: list[dict]) -> list[dict]:
    return sorted(versions, key=lambda v: v["version"])


def branch(project: dict, label: str) -> dict:
    """History for a NEW working version derived from the current one."""
    meta = load(project)
    numbers = [meta["current"], *(v["version"] for v in meta["versions"])]
    return {"current": max(numbers) + 1, "current_parent": meta["current"], "current_label": label,
            "versions": _sorted([*meta["versions"], snapshot(project, meta)])}


def switch(project: dict, number: int) -> dict:
    """Column updates that make stored version `number` the working version."""
    meta = load(project)
    if number == meta["current"]:
        raise HTTPException(409, f"Version {number} is already the working version")
    target = next((v for v in meta["versions"] if v["version"] == number), None)
    if not target:
        raise HTTPException(404, f"Version {number} not found")
    if target.get("legacy"):
        raise HTTPException(409, f"Version {number} was saved before full version snapshots existed; it can only be viewed")
    others = [v for v in meta["versions"] if v["version"] != number]
    return {
        "title": target["title"], "idea_text": target["idea_text"],
        **{k: target.get(k) for k in STAGE_DATA},
        "stage": stage_of(target),
        "history": {"current": number, "current_parent": target.get("parent"), "current_label": target.get("label"),
                    "versions": _sorted([*others, snapshot(project, meta)])},
    }
