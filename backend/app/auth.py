"""Authentication via Supabase Auth.

The browser logs in with Supabase and sends the access token as
`Authorization: Bearer <token>`. The backend verifies it with Supabase and
passes the same token on to the database, so Row-Level Security applies.
Without Supabase configured, every request runs as a single local user.
"""
import re
import time
from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException

from .config import settings

TOKEN_CACHE_SECONDS = 300
_token_cache: dict[str, tuple[float, "User"]] = {}


@dataclass(frozen=True)
class User:
    id: str
    email: str
    token: str | None = None


LOCAL_USER = User(id="local", email="local")


def valid_email(email: str) -> bool:
    """Same rule as the sign-up form, so an account made around the form cannot use the app."""
    return bool(re.fullmatch(r"[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\W\d_]{2,}", email))


def _verify(token: str) -> User:
    cached = _token_cache.get(token)
    if cached and cached[0] > time.time():
        return cached[1]
    try:
        r = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Could not reach Supabase Auth: {e}") from e
    if r.status_code != 200:
        raise HTTPException(401, "Session expired or invalid — please log in again")
    data = r.json()
    if not valid_email(data.get("email") or ""):
        raise HTTPException(401, "This account does not have a valid email address. Sign up with a real one.")
    user = User(id=data["id"], email=data.get("email") or "", token=token)
    _token_cache[token] = (time.time() + TOKEN_CACHE_SECONDS, user)
    return user


def current_user(authorization: str | None = Header(default=None)) -> User:
    """FastAPI dependency: the logged-in user (or the local user when auth is off)."""
    if not settings.auth_enabled:
        return LOCAL_USER
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please log in")
    return _verify(authorization.split(" ", 1)[1].strip())
