"""SQLite persistence for projects.

Each project row stores the user input plus the JSON output of every
pipeline stage (profile, literature, score, refinement, plan, paper, guidance), so stages
can be re-run independently and the UI can resume where the user left off.
`history` holds the project's other versions (see services/versions_service).
"""
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from .config import settings

STAGE_COLUMNS = ("profile", "literature", "score", "refinement", "plan", "paper", "guidance")
JSON_COLUMNS = (*STAGE_COLUMNS, "history")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                idea_text   TEXT NOT NULL DEFAULT '',
                github_url  TEXT NOT NULL DEFAULT '',
                domain      TEXT NOT NULL DEFAULT '',
                stage       INTEGER NOT NULL DEFAULT 1,
                profile     TEXT,
                literature  TEXT,
                score       TEXT,
                refinement  TEXT,
                plan        TEXT,
                paper       TEXT,
                guidance    TEXT,
                history     TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
            """
        )
        # Migrate databases created before stages 6/7 and version history existed
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)")}
        for col in ("refinement", "plan", "paper", "guidance", "history"):
            if col not in columns:
                conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    for col in JSON_COLUMNS:
        d[col] = json.loads(d[col]) if d[col] else None
    return d


def create_project(title: str, idea_text: str, github_url: str, domain: str) -> dict:
    pid = uuid.uuid4().hex[:12]
    now = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, title, idea_text, github_url, domain, stage, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (pid, title, idea_text, github_url, domain, now, now),
        )
    return get_project(pid)


def list_projects() -> list[dict]:
    """Project rows for the projects table, with a few summary fields from the stage results."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, github_url, domain, stage, created_at, updated_at, score, paper, guidance, history"
            " FROM projects ORDER BY updated_at DESC"
        ).fetchall()
    out = []
    for r in rows:
        d = _row_to_dict(r)
        history = d.pop("history")
        out.append({
            **{k: d[k] for k in ("id", "title", "github_url", "domain", "stage", "created_at", "updated_at")},
            "ros": (d["score"] or {}).get("total"),
            "paper_score": ((d["paper"] or {}).get("score") or {}).get("total"),
            "tier": ((d["guidance"] or {}).get("tier") or {}).get("name"),
            "version": history.get("current") if isinstance(history, dict) else None,
        })
    return out


def get_project(pid: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    return _row_to_dict(row) if row else None


def save_stage(pid: str, column: str, data: dict, stage: int) -> dict:
    """Store a stage result. Re-running an earlier stage clears later ones."""
    if column not in STAGE_COLUMNS:
        raise ValueError(f"Unknown stage column: {column}")
    later = STAGE_COLUMNS[STAGE_COLUMNS.index(column) + 1:]
    clears = "".join(f", {c} = NULL" for c in later)
    with _connect() as conn:
        conn.execute(
            f"UPDATE projects SET {column} = ?, stage = ?, updated_at = ?{clears} WHERE id = ?",
            (json.dumps(data), stage, _now(), pid),
        )
    return get_project(pid)


def update_project(pid: str, fields: dict) -> dict | None:
    """Update input fields and/or stage columns directly (no clearing of later stages)."""
    allowed = {"title", "idea_text", "stage", *JSON_COLUMNS}
    if not fields.keys() <= allowed:
        raise ValueError(f"Unknown columns: {set(fields) - allowed}")
    values = [json.dumps(v) if k in JSON_COLUMNS and v is not None else v for k, v in fields.items()]
    assignments = ", ".join(f"{k} = ?" for k in fields)
    with _connect() as conn:
        conn.execute(f"UPDATE projects SET {assignments}, updated_at = ? WHERE id = ?", (*values, _now(), pid))
    return get_project(pid)


def delete_project(pid: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
    return cur.rowcount > 0
