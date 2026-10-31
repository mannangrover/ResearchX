import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..auth import User, current_user
from ..schemas import LiteratureRequest, PaperUpload, PlanOptions, ProjectCreate, ProposalUpdate, RefineMessage
from ..services import experiment_service, paper_service, pipeline, refinement_service, versions_service
from ..services.github_service import GitHubError, parse_repo_url
from ..storage import get_store

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_or_404(store, pid: str) -> dict:
    project = store.get_project(pid)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.get("")
def list_projects(user: User = Depends(current_user)):
    return get_store(user).list_projects()


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
def delete_project(pid: str, user: User = Depends(current_user)):
    if not get_store(user).delete_project(pid):
        raise HTTPException(404, "Project not found")


@router.post("/{pid}/analyze")
async def analyze(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    try:
        result = await run_in_threadpool(pipeline.run_analysis, project)
    except GitHubError as e:
        raise HTTPException(422, str(e))
    return store.save_stage(pid, "profile", result, stage=2)


@router.post("/{pid}/literature")
async def literature(pid: str, body: LiteratureRequest | None = None, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    if not project["profile"]:
        raise HTTPException(409, "Run project analysis (stage 2) first")
    result = await run_in_threadpool(pipeline.run_literature, project, body.queries if body else None)
    if not result["papers"]:
        if result["errors"]:
            detail = ("The paper sources are busy or rate-limited right now. Wait about 30 seconds and try again"
                      " (adding OpenAlex / Semantic Scholar keys in backend/.env avoids this). Details: "
                      + "; ".join(result["errors"]))
        else:
            detail = "No related papers found. Try simpler or broader search queries."
        raise HTTPException(502, detail)
    return store.save_stage(pid, "literature", result, stage=3)


@router.post("/{pid}/score")
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


@router.post("/{pid}/refine/start")
async def refine_start(pid: str, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = await run_in_threadpool(refinement_service.start, project)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.post("/{pid}/refine/message")
async def refine_message(pid: str, body: RefineMessage, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    state = await run_in_threadpool(refinement_service.reply, project, body.content)
    return store.save_stage(pid, "refinement", state, stage=_refine_stage(state))


@router.post("/{pid}/refine/propose")
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


@router.post("/{pid}/refine/apply")
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
               "refinement": None, "plan": None, "paper": None, "history": history}
    literature, score = await run_in_threadpool(pipeline.rescore_refined, refined)
    return store.update_project(pid, {
        "title": refined["title"], "idea_text": refined["idea_text"], "history": history, "stage": 4,
        "literature": literature, "score": score, "refinement": None, "plan": None, "paper": None,
    })


@router.post("/{pid}/versions/{number}/switch")
def switch_version(pid: str, number: int, user: User = Depends(current_user)):
    """Make a stored version the working version (the current one is kept in history)."""
    store = get_store(user)
    project = _get_or_404(store, pid)
    return store.update_project(pid, versions_service.switch(project, number))


# ---------------------------------------------------------------- stage 7: experiment planning
@router.post("/{pid}/plan")
async def plan(pid: str, body: PlanOptions | None = None, user: User = Depends(current_user)):
    store = get_store(user)
    project = _scored_or_409(store, pid)
    options = (body or PlanOptions()).model_dump()
    result = await run_in_threadpool(experiment_service.build_plan, project, options)
    return store.save_stage(pid, "plan", result, stage=7)


# ---------------------------------------------------------------- stage 8: paper evaluation
@router.post("/{pid}/paper")
async def paper(pid: str, body: PaperUpload, user: User = Depends(current_user)):
    store = get_store(user)
    project = _get_or_404(store, pid)
    if not project.get("plan"):
        raise HTTPException(409, "Create the experiment plan (stage 7) first: the paper is evaluated against it")
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The uploaded file could not be decoded")
    result = await run_in_threadpool(paper_service.evaluate, project, body.filename, data, body.change_note.strip())
    previous = project.get("paper")
    if previous:
        drafts = previous.get("drafts", [])
        result["drafts"] = [*drafts, paper_service.draft_summary(previous, len(drafts) + 1)]
    else:
        result["drafts"] = []
    return store.save_stage(pid, "paper", result, stage=8)
