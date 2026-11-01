"""Project storage behind one interface (Repository pattern).

- LocalStore:    SQLite file, single user (no login) — used when Supabase is not configured.
- SupabaseStore: Supabase Postgres via its REST API (PostgREST), called with the user's
                 own access token so Row-Level Security limits every query to their rows.
"""
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

from . import database
from .auth import User
from .config import settings

# Small summary fields read straight out of the JSON columns for the projects table
LIST_COLUMNS = ("id,title,github_url,domain,stage,created_at,updated_at,"
                "ros:score->total,paper_score:paper->score->total,tier:guidance->tier->>name,version:history->current")


class LocalStore:
    def list_projects(self) -> list[dict]:
        return database.list_projects()

    def get_project(self, pid: str) -> dict | None:
        return database.get_project(pid)

    def create_project(self, title: str, idea_text: str, github_url: str, domain: str) -> dict:
        return database.create_project(title, idea_text, github_url, domain)

    def save_stage(self, pid: str, column: str, data: dict, stage: int) -> dict:
        return database.save_stage(pid, column, data, stage)

    def update_project(self, pid: str, fields: dict) -> dict | None:
        return database.update_project(pid, fields)

    def delete_project(self, pid: str) -> bool:
        return database.delete_project(pid)


class SupabaseStore:
    def __init__(self, user: User):
        self.user = user
        self.base = f"{settings.SUPABASE_URL}/rest/v1/projects"
        self.headers = {
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {user.token}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, params: dict | None = None, json=None, prefer: str | None = None) -> list[dict]:
        headers = {**self.headers, **({"Prefer": prefer} if prefer else {})}
        try:
            r = httpx.request(method, self.base, params=params, json=json, headers=headers, timeout=20.0)
        except httpx.HTTPError as e:
            raise HTTPException(503, f"Could not reach Supabase: {e}") from e
        if r.status_code == 401:
            raise HTTPException(401, "Session expired — please log in again")
        if r.status_code >= 400:
            raise HTTPException(502, f"Supabase error {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else []

    def list_projects(self) -> list[dict]:
        return self._request("GET", {"select": LIST_COLUMNS, "order": "updated_at.desc"})

    def get_project(self, pid: str) -> dict | None:
        rows = self._request("GET", {"select": "*", "id": f"eq.{pid}"})
        return rows[0] if rows else None

    def create_project(self, title: str, idea_text: str, github_url: str, domain: str) -> dict:
        row = {"id": uuid.uuid4().hex[:12], "user_id": self.user.id, "title": title,
               "idea_text": idea_text, "github_url": github_url, "domain": domain, "stage": 1}
        return self._request("POST", json=row, prefer="return=representation")[0]

    def save_stage(self, pid: str, column: str, data: dict, stage: int) -> dict:
        """Store a stage result. Re-running an earlier stage clears later ones."""
        stages = database.STAGE_COLUMNS
        if column not in stages:
            raise ValueError(f"Unknown stage column: {column}")
        update = {column: data, "stage": stage, "updated_at": datetime.now(timezone.utc).isoformat()}
        update.update({c: None for c in stages[stages.index(column) + 1:]})
        rows = self._request("PATCH", {"id": f"eq.{pid}"}, json=update, prefer="return=representation")
        if not rows:
            raise HTTPException(404, "Project not found")
        return rows[0]

    def update_project(self, pid: str, fields: dict) -> dict | None:
        update = {**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
        rows = self._request("PATCH", {"id": f"eq.{pid}"}, json=update, prefer="return=representation")
        return rows[0] if rows else None

    def delete_project(self, pid: str) -> bool:
        return bool(self._request("DELETE", {"id": f"eq.{pid}"}, prefer="return=representation"))


def get_store(user: User):
    return SupabaseStore(user) if settings.auth_enabled else LocalStore()
