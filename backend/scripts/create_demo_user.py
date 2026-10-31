"""Create (or reset) the shared demo account in your Supabase project.

Uses the Supabase Admin API with SUPABASE_SECRET_KEY, so the account is created
already confirmed (no email link needed). Run once from backend/:

    python -m scripts.create_demo_user

Reads DEMO_EMAIL / DEMO_PASSWORD from backend/.env.
"""
import sys

import httpx

from app.config import settings


def main():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "DEMO_EMAIL", "DEMO_PASSWORD")
               if not getattr(settings, k)]
    if missing:
        sys.exit(f"Set these in backend/.env first: {', '.join(missing)}")

    admin = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    key = settings.SUPABASE_SECRET_KEY
    headers = {"apikey": key}
    if not key.startswith("sb_"):  # legacy JWT service_role key also goes in Authorization
        headers["Authorization"] = f"Bearer {key}"
    body = {"email": settings.DEMO_EMAIL, "password": settings.DEMO_PASSWORD, "email_confirm": True,
            "user_metadata": {"name": "Demo User"}}

    r = httpx.post(admin, json=body, headers=headers, timeout=20.0)
    if r.status_code in (200, 201):
        print(f"Demo account created: {settings.DEMO_EMAIL}")
        return
    if r.status_code == 422 and "already" in r.text.lower():
        # Already exists: reset its password so it matches .env
        users = httpx.get(admin, headers=headers, params={"per_page": 1000}, timeout=20.0).json().get("users", [])
        user = next((u for u in users if u.get("email") == settings.DEMO_EMAIL.lower()), None)
        if user:
            httpx.put(f"{admin}/{user['id']}", json={"password": settings.DEMO_PASSWORD, "email_confirm": True},
                      headers=headers, timeout=20.0).raise_for_status()
            print(f"Demo account already existed; password reset to match .env: {settings.DEMO_EMAIL}")
            return
    sys.exit(f"Failed ({r.status_code}): {r.text[:300]}")


if __name__ == "__main__":
    main()
