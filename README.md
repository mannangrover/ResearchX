# ResearchX — AI-Powered Research Paper Workflow Assistant

ResearchX takes a research idea and/or a GitHub repository, finds related literature, and gives an
evidence-based **Research Opportunity Score (ROS)** with research gaps and suggested modifications.

This repository implements stages 1–6 of the 10-stage workflow in the SRS.

| # | Stage (SRS §1.4) | Status |
|---|---|---|
| 1 | Idea / Project Input | ✅ Built |
| 2 | Project Analysis (GitHub README, file tree, languages, dependencies + LLM profile) | ✅ Built |
| 3 | Literature Analysis (OpenAlex, Semantic Scholar, arXiv + semantic ranking) | ✅ Built |
| 4 | Research Opportunity Score (6 transparent dimensions) | ✅ Built |
| 5 | Research Gap Discovery | ✅ Built |
| 6 | Interactive Refinement (advisor chat → editable refined proposal → approve → re-score as a new project) | ✅ Built |
| 7–10 | Experiment Planning, Paper Development, Reviewer Simulation, Publication Guidance | Next milestones |

## Architecture

```
React (Vite) frontend  ──/api──▶  FastAPI backend
                                    ├─ github_service      GitHub REST API → repo profile
                                    ├─ profile_service     LLM / heuristic technical profile
                                    ├─ literature_service  OpenAlex + Semantic Scholar + arXiv (parallel)
                                    ├─ similarity_service  Sentence Transformers (all-MiniLM-L6-v2) or TF-IDF
                                    ├─ scoring_service     Research Opportunity Score
                                    ├─ pipeline            stage orchestration + LLM gap analysis
                                    ├─ llm_service         Gemini / OpenRouter / OpenAI / Anthropic, with fallback models
                                    └─ SQLite              projects + stored stage results
```

Every LLM step has a heuristic fallback, so the app keeps working if the LLM is rate-limited or offline.
The score itself is always computed from measurable signals; the LLM only explains it.

### Research Opportunity Score

| Dimension | Weight | Computed from |
|---|---|---|
| Literature overlap (novelty space) | 25% | Similarity of the closest and top-5 papers |
| Technical depth | 15% | Techniques, code size, languages, dependencies |
| Feasibility | 15% | Existing code, declared dependencies, evaluation plan, open-access baselines |
| Potential impact | 15% | Share of recent papers in the area, citations, repo stars |
| Reproducibility | 10% | README, dependency file, tests, CI, licence, Docker, docs |
| Contribution potential | 20% | Novelty space × field activity × depth |

Bands: ≥70 Strong · 50–69 Moderate · 35–49 Limited · <35 Weak.

## Setup (first time)

Requirements: Python 3.10+, Node 18+.

```bash
cd backend
pip install -r requirements.txt
pip install sentence-transformers          # better similarity (optional, CPU is fine)
python -m scripts.download_model           # ~90 MB embedding model into backend/models/
copy .env.example .env                     # then put your LLM key in .env
```

```bash
cd frontend
npm install
```

### `.env` keys

| Key | Needed? | Notes |
|---|---|---|
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | Optional | e.g. `gemini` + `gemini-3.5-flash-lite`. Without a key the app uses heuristics. |
| `LLM_FALLBACK_MODELS` | Optional | Comma-separated models tried when the main one is overloaded |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional | Free; avoids 429 rate limits |
| `OPENALEX_API_KEY` | Optional | Free from openalex.org; the keyless daily budget is shared per network |
| `GITHUB_TOKEN` | Optional | Raises GitHub limit from 60 to 5000 requests/hour |

### Login and cloud storage (Supabase, optional)

With `SUPABASE_URL` and `SUPABASE_ANON_KEY` set, the app requires login (email + password via
Supabase Auth) and stores projects in Supabase Postgres. Row-Level Security limits every user to
their own projects. Without them, the app runs in local mode: no login, SQLite file.

1. Run [docs/supabase_schema.sql](docs/supabase_schema.sql) in the Supabase SQL Editor (creates the
   `projects` table and its security policies).
2. In Authentication → Sign In / Providers, turn off **Confirm email** so sign-ups work instantly.
3. Demo account: put `SUPABASE_SECRET_KEY` in `.env`, then run `python -m scripts.create_demo_user`.

## Run

Double-click **`start.bat`**, or in two terminals:

```bash
cd backend && python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. API docs (Swagger) are at http://localhost:8000/docs.

## Test

End-to-end smoke test of all five stages against the live APIs:

```bash
cd backend && python -m scripts.smoke_test https://github.com/qodo-ai/pr-agent
```

## API

| Method | Endpoint | Stage |
|---|---|---|
| `POST` | `/api/projects` | 1 — create project (title, idea_text, github_url, domain) |
| `GET` | `/api/projects`, `/api/projects/{id}` | list / fetch |
| `POST` | `/api/projects/{id}/analyze` | 2 — technical profile |
| `POST` | `/api/projects/{id}/literature` | 3 — related papers (optional `{"queries": [...]}`) |
| `POST` | `/api/projects/{id}/score` | 4 + 5 — ROS, gaps, modifications, research questions |
| `DELETE` | `/api/projects/{id}` | delete |
| `POST` | `/api/projects/{id}/refine/start` | 6 — advisor's opening message |
| `POST` | `/api/projects/{id}/refine/message` | 6 — send a message (`{"content": "..."}`) |
| `POST` | `/api/projects/{id}/refine/propose` | 6 — draft the refined proposal from the discussion |
| `PUT` | `/api/projects/{id}/refine/proposal` | 6 — save edits / approve (`{"proposal": {...}, "approved": true}`) |
| `POST` | `/api/projects/{id}/refine/spinoff` | 6 — create a new project from the approved proposal |

Re-running a stage clears the stages after it, so results never go stale.

## Limitations

ResearchX is a decision-support tool. It does not guarantee novelty, publication acceptance, or the
correctness of generated text; human review remains essential (SRS §1.1).
