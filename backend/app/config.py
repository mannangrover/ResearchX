"""Application settings, loaded from environment variables / backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings:
    # Storage — local SQLite, or Supabase (Postgres + Auth) when SUPABASE_URL/ANON_KEY are set
    DB_PATH: str = os.getenv("DB_PATH", str(BASE_DIR / "researchx.db"))
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")      # publishable key, safe for the browser
    SUPABASE_SECRET_KEY: str = os.getenv("SUPABASE_SECRET_KEY", "")  # only used by scripts/create_demo_user.py
    DEMO_EMAIL: str = os.getenv("DEMO_EMAIL", "")
    DEMO_PASSWORD: str = os.getenv("DEMO_PASSWORD", "")

    # LLM (optional — the pipeline falls back to heuristics when no key is set)
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai").lower()  # openai | openrouter | anthropic | gemini
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "")
    # Tried in order when the main model is overloaded or rate-limited
    LLM_FALLBACK_MODELS: list[str] = [m.strip() for m in os.getenv("LLM_FALLBACK_MODELS", "").split(",") if m.strip()]

    # External APIs (optional keys raise rate limits)
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    SEMANTIC_SCHOLAR_API_KEY: str = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")
    OPENALEX_API_KEY: str = os.getenv("OPENALEX_API_KEY", "")

    # Literature retrieval
    MAX_PAPERS_PER_SOURCE: int = int(os.getenv("MAX_PAPERS_PER_SOURCE", "15"))
    TOP_K_PAPERS: int = int(os.getenv("TOP_K_PAPERS", "10"))

    # Embeddings: "auto" uses sentence-transformers if installed, else TF-IDF; "gemini" needs no local model
    EMBEDDING_BACKEND: str = os.getenv("EMBEDDING_BACKEND", "auto")
    # A local copy in backend/models/ is used when present (works offline)
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL") or (
        str(BASE_DIR / "models" / "all-MiniLM-L6-v2")
        if (BASE_DIR / "models" / "all-MiniLM-L6-v2" / "tokenizer.json").exists()
        else "all-MiniLM-L6-v2"
    )

    # Hosting (all set in the Dockerfile; local runs leave them off)
    REQUIRE_AUTH: bool = os.getenv("REQUIRE_AUTH", "").lower() == "true"  # refuse to start without Supabase
    STATIC_DIR: str = os.getenv("STATIC_DIR", "")  # built frontend, served by the API when set
    # Actions per UTC day that call the AI and paper APIs; 0 means no limit
    DAILY_LIMIT_PER_USER: int = int(os.getenv("DAILY_LIMIT_PER_USER", "0"))
    DAILY_LIMIT_TOTAL: int = int(os.getenv("DAILY_LIMIT_TOTAL", "0"))

    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")

    @property
    def auth_enabled(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_ANON_KEY)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.LLM_API_KEY)


settings = Settings()
