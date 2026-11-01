"""Standalone paper analysis: upload a paper and get its analysis, with no project.

Each analysis is stored as a row of the projects table with `paper.standalone`
set, so it is private to the user and shares the trash with projects.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from ..auth import User, current_user
from ..limits import ai_quota
from ..schemas import PaperUpload
from ..services import paper_service
from ..storage import get_store

router = APIRouter(prefix="/api/papers", tags=["papers"])


@router.post("", status_code=201, dependencies=[Depends(ai_quota)])
async def analyse_paper(body: PaperUpload, user: User = Depends(current_user)):
    data = paper_service.decode_upload(body.content_base64)
    result = await run_in_threadpool(paper_service.analyse_standalone, body.filename, data)
    about = result["about"]
    store = get_store(user)
    row = store.create_project(about["title"], about["one_line"] or about["summary"][:500], "", about["field"])
    result["drafts"] = []
    return store.update_project(row["id"], {"paper": result, "stage": 8})


@router.post("/{pid}", dependencies=[Depends(ai_quota)])
async def analyse_revised_draft(pid: str, body: PaperUpload, user: User = Depends(current_user)):
    store = get_store(user)
    project = store.get_project(pid)
    previous = (project or {}).get("paper") or {}
    if not previous.get("standalone"):
        raise HTTPException(404, "Paper analysis not found")
    data = paper_service.decode_upload(body.content_base64)
    result = await run_in_threadpool(paper_service.analyse_standalone, body.filename, data)
    drafts = previous.get("drafts", [])
    result["drafts"] = [*drafts, paper_service.draft_summary(previous, len(drafts) + 1)]
    about = result["about"]
    return store.update_project(pid, {"title": about["title"], "idea_text": about["one_line"] or about["summary"][:500], "paper": result})
