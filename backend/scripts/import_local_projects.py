"""Copy projects from the local SQLite database into the demo account in Supabase.

By default only the newest, most complete project per title is copied (local
testing tends to leave duplicates). Pass --all to copy every project.

Run from backend/ after scripts.create_demo_user:

    python -m scripts.import_local_projects [--all]

Uses SUPABASE_SECRET_KEY (server-side only) to look up the demo user and insert
rows owned by them; re-running is safe (rows are upserted by id).
"""
import sys

import httpx

from app import database as db
from app.config import settings


def admin_headers() -> dict:
    key = settings.SUPABASE_SECRET_KEY
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):  # legacy JWT service_role key also goes in Authorization
        headers["Authorization"] = f"Bearer {key}"
    return headers


def demo_user_id(client: httpx.Client) -> str:
    r = client.get(f"{settings.SUPABASE_URL}/auth/v1/admin/users", params={"per_page": 1000})
    r.raise_for_status()
    for u in r.json().get("users", []):
        if u.get("email") == settings.DEMO_EMAIL.lower():
            return u["id"]
    sys.exit(f"Demo user {settings.DEMO_EMAIL} not found — run: python -m scripts.create_demo_user")


def pick_projects(copy_all: bool) -> list[dict]:
    projects = [db.get_project(p["id"]) for p in db.list_projects()]  # newest first
    if copy_all:
        return projects
    best: dict[str, dict] = {}
    for p in projects:
        current = best.get(p["title"])
        if current is None or p["stage"] > current["stage"]:
            best[p["title"]] = p
    return list(best.values())


def main():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "DEMO_EMAIL") if not getattr(settings, k)]
    if missing:
        sys.exit(f"Set these in backend/.env first: {', '.join(missing)}")

    with httpx.Client(headers=admin_headers(), timeout=30.0) as client:
        owner = demo_user_id(client)
        rows = []
        for p in pick_projects("--all" in sys.argv):
            rows.append({
                "id": p["id"], "user_id": owner, "title": p["title"], "idea_text": p["idea_text"],
                "github_url": p["github_url"], "domain": p["domain"], "stage": p["stage"],
                "profile": p["profile"], "literature": p["literature"], "score": p["score"], "refinement": p.get("refinement"),
                "created_at": p["created_at"], "updated_at": p["updated_at"],
            })
        if not rows:
            sys.exit("No local projects to import")
        r = client.post(
            f"{settings.SUPABASE_URL}/rest/v1/projects",
            params={"on_conflict": "id"},
            json=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        if r.status_code >= 400:
            sys.exit(f"Import failed ({r.status_code}): {r.text[:300]}")
    for row in rows:
        print(f"  imported  {row['id']}  stage {row['stage']}  {row['title']}")
    print(f"Done: {len(rows)} project(s) now in {settings.DEMO_EMAIL}")


if __name__ == "__main__":
    main()
