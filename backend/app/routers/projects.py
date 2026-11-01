from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..auth import User, current_user
from ..limits import ai_quota
from ..schemas import LiteratureRequest, PaperUpload, PlanOptions, ProjectCreate, ProposalUpdate, RefineMessage
from ..services import experiment_service, guidance_service, paper_service, pipeline, refinement_service, versions_service
from ..services.github_service import GitHubError, parse_repo_url
from ..storage import get_store

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_or_404(store, pid: str) -> dict:
    project = store.get_project(pid)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


TRASH_DAYS = 30


@router.get("")
def list_projects(user: User = Depends(current_user)):
    """All projects, including those in the trash (`deleted_at` set). Trash older than 30 days is purged first."""
    store = get_store(user)
    store.purge_trash((datetime.now(timezone.utc) - timedelta(days=TRASH_DAYS)).isoformat())
    return store.list_projects()


@router.post("", status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(current_user)):
    url = pipeline.clean_url(body.github_url)
    if url:
        try:
            parse_repo_url(url)
        except GitHubError as e:
            raise HTTPException(422, str(e))
    return get_store(user).create_project(body.title.strip(), body.idea_text.strip(), url, body.domain.strip())


@router.get("/{pid}")
def get_project(pid: str, user: User = Depends(current_user)):
    return _get_or_404(get_store(user), pid)


@router.delete("/{pid}", status_code=204)
def trash_project(pid: str, user: User = Depends(current_user)):
    """Move a project to the trash; it can be restored for 30 days."""
    if not get_store(user).set_trashed(pid, datetime.now(timezone.utc).isoformat()):
        raise HTTPException(404, "Project not found")


@router.post("/{pid}/restore")
def restore_project(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    if not store.set_trashed(pid, None):
        raise HTTPException(404, "Project not found")
    return _get_or_404(store, pid)


@router.delete("/{pid}/permanent", status_code=204)
def delete_forever(pid: str, user: User = Depends(current_user)):
    """Permanently delete a project. Only projects already in the trash can be deleted this way."""
    store = get_store(user)
    if not _get_or_404(store, pid).get("deleted_at"):
        raise HTTPException(409, "Move the project to the trash first")
    store.delete_project(pid)


@router.post("/{pid}/analyze", dependencies=[Depends(ai_quota)])
async def analyze(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    try:
        result = await run_in_threadpool(pipeline.run_analysis, project)
    except GitHubError as e:
        raise HTTPException(422, str(e))
    return store.save_stage(pid, "profile", result, stage=2)


@router.post("/{pid}/literature", dependencies=[Depends(ai_quota)])
async def literature(pid: str, body: LiteratureRequest | None = None, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    if not project["profile"]:
        raise HTTPException(409, "Run project analysis (stage 2) first")
    result = await run_in_threadpool(pipeline.run_literature, project, body.queries if body else None)
    if not result["papers"]:
        if result["errors"]:
            detail = ("The paper sources are busy or rate-limited right now. Wait about 30 seconds and try again."
                      " Details: "
                      + "; ".join(result["errors"]))
        else:
            detail = "No related papers found. Try simpler or broader search queries."
        raise HTTPException(502, detail)
    return store.save_stage(pid, "literature", result, stage=3)


@router.post("/{pid}/score", dependencies=[Depends(ai_quota)])
async def score(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    if not project["literature"]:
        raise HTTPException(409, "Run literature analysis (stage 3) first")
    result = await run_in_threadpool(pipeline.run_scoring, project)
    return store.save_stage(pid, "score", result, stage=4)


# ---------------------------------------------------------------- stage 6: interactive refinement
def _scored_or_409(store, pid: str) -> dict:
    project = _get_or_404(store, pid)
    if not project["score"]:
        raise HTTPException(409, "Compute the Research Opportunity Score (stage 4) first")
    return project


def _refine_stage(state: dict) -> int:
    return 6 if state.get("approved") else 4


@router.post("/{pid}/refine/start", dependencies=[Depends(ai_quota)])
async def refine_start(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = await run_in_threadpool(refinement_service.start, project)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.post("/{pid}/refine/message", dependencies=[Depends(ai_quota)])
async def refine_message(pid: str, body: RefineMessage, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = await run_in_threadpool(refinement_service.reply, project, body.content)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.post("/{pid}/refine/propose", dependencies=[Depends(ai_quota)])
async def refine_propose(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = await run_in_threadpool(refinement_service.propose, project)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.put("/{pid}/refine/proposal")
def refine_save_proposal(pid: str, body: ProposalUpdate, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = refinement_service.save_proposal(project, body.proposal, body.approved)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.delete("/{pid}/refine")
def refine_reset(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    _scored_or_409(store, pid)
    return store.save_stage(pid, "refinement", None, stage=4)


@router.post("/{pid}/refine/apply", dependencies=[Depends(ai_quota)])
async def refine_apply(pid: str, user: User = Depends(current_user)):
    """Turn the approved proposal into a NEW VERSION of this project.

    The working version is kept in full in `history`. The new version keeps the
    same technical profile (stage 2) and papers (stage 3, re-ranked against the
    refined idea) and only re-computes the Research Opportunity Score (4 + 5).
    """
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = project.get("refinement") or {}
    if not state.get("approved") or not state.get("proposal"):
        raise HTTPException(409, "Approve the refined proposal first")
    history = versions_service.branch(project, "Refined")
    refined = {**project, **refinement_service.refined_input(state["proposal"]),
               "refinement": None, "plan": None, "paper": None, "guidance": None, "history": history}
    literature, score = await run_in_threadpool(pipeline.rescore_refined, refined)
    return store.update_project(pid, {
        "title": refined["title"], "idea_text": refined["idea_text"], "history": history, "stage": 4,
        "literature": literature, "score": score, "refinement": None, "plan": None, "paper": None, "guidance": None,
    })


@router.post("/{pid}/versions/{number}/switch")
def switch_version(pid: str, number: int, user: User = Depends(current_user)):
    """Make a stored version the working version (the current one is kept in history)."""
    store = get_store(user)
    project = _get_or_404(store, pid)
    return store.update_project(pid, versions_service.switch(project, number))


# ---------------------------------------------------------------- stage 7: experiment planning
@router.post("/{pid}/plan", dependencies=[Depends(ai_quota)])
async def plan(pid: str, body: PlanOptions | None = None, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    options = (body or PlanOptions()).model_dump()
    result = await run_in_threadpool(experiment_service.build_plan, project, options)
    return store.save_stage(pid, "plan", result, stage=7)


# ---------------------------------------------------------------- stage 8: paper evaluation
@router.post("/{pid}/paper", dependencies=[Depends(ai_quota)])
async def paper(pid: str, body: PaperUpload, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)  # the plan (stage 7) is optional: the paper is compared with it when it exists
    data = paper_service.decode_upload(body.content_base64)
    result = await run_in_threadpool(paper_service.evaluate, project, body.filename, data, body.change_note.strip())
    previous = project.get("paper")
    drafts = [d for d in (previous or {}).get("drafts", []) if d.get("score") is not None]
    summary = paper_service.draft_summary(previous, len(drafts) + 1) if previous else None
    result["drafts"] = [*drafts, summary] if summary else drafts
    return store.save_stage(pid, "paper", result, stage=8)


# ---------------------------------------------------------------- stage 10: publication guidance
@router.post("/{pid}/guidance")
def guidance(pid: str, user: User = Depends(current_user)):
    """Readiness and target venue tier, computed from the stage 4 score and the stage 8 paper evaluation."""
    store = get_store(user)
    project = _get_or_404(store, pid)
    if not (project.get("paper") or {}).get("analysis") or not project.get("score"):
        raise HTTPException(409, "Evaluate your paper (stage 8) first")
    return store.save_stage(pid, "guidance", guidance_service.assess(project), stage=10)
