"""Daily limits on the actions that call the AI and paper APIs.

They stop a public deployment from exhausting the API keys: per user, and in
total because anyone can sign up for more accounts. The counts live in memory,
so a restart clears them. Requires a single server process.
"""
import threading
from collections import Counter
from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from .auth import User, current_user
from .config import settings

_lock = threading.Lock()
_day = ""
_per_user: Counter[str] = Counter()
_total = 0


def ai_quota(user: User = Depends(current_user)) -> None:
    """FastAPI dependency: counts one action, or refuses it with 429 when a limit is reached."""
    global _day, _total
    per_user, total = settings.DAILY_LIMIT_PER_USER, settings.DAILY_LIMIT_TOTAL
    with _lock:
        today = datetime.now(timezone.utc).date().isoformat()
        if today != _day:
            _day, _total = today, 0
            _per_user.clear()
        if per_user and _per_user[user.id] >= per_user:
            raise HTTPException(429, f"You have used today's limit of {per_user} analyses. It resets at midnight UTC.")
        if total and _total >= total:
            raise HTTPException(429, "ResearchX has reached its limit of analyses for today. It resets at midnight UTC.")
        _per_user[user.id] += 1
        _total += 1
