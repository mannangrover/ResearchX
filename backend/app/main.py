import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import database
from .config import settings
from .routers import projects
from .services import llm_service, similarity_service

app = FastAPI(
    title="ResearchX API",
    description="AI-powered research paper workflow assistant — prototype (stages 1-5).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()
app.include_router(projects.router)

# Load the embedding model in the background so the first literature search isn't slow
threading.Thread(target=similarity_service.warm_up, daemon=True).start()


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "llm": llm_service.status(),
        "storage": "supabase" if settings.auth_enabled else "local-sqlite",
    }


@app.get("/api/auth/config")
def auth_config():
    """Public settings the browser needs to talk to Supabase Auth (the anon key is public by design)."""
    if not settings.auth_enabled:
        return {"enabled": False}
    return {
        "enabled": True,
        "supabase_url": settings.SUPABASE_URL,
        "anon_key": settings.SUPABASE_ANON_KEY,
        # Shared demo account for presentations — never put real data in it
        "demo": {"email": settings.DEMO_EMAIL, "password": settings.DEMO_PASSWORD}
        if settings.DEMO_EMAIL and settings.DEMO_PASSWORD else None,
    }
