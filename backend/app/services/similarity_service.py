"""Semantic similarity between the project and retrieved papers.

Uses Sentence Transformers when installed (pip install sentence-transformers),
otherwise TF-IDF cosine similarity, so the prototype runs with no GPU / torch.
Small servers can use Gemini embeddings instead (EMBEDDING_BACKEND=gemini), which
need no local model and fall back to TF-IDF when the API is unavailable.
"""
from functools import lru_cache

import httpx
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings
from .text_utils import analyze, tokenize

GEMINI_EMBEDDING_MODEL = "gemini-embedding-2"
GEMINI_BATCH = 100
# Maps Gemini cosines onto the all-MiniLM-L6-v2 scale, so that closeness labels and
# score ranges mean the same on both. Fitted on 168 pairs of papers (r = 0.92).
GEMINI_TO_MINILM = (2.838, -1.799)


@lru_cache(maxsize=1)
def _sentence_model():
    from sentence_transformers import SentenceTransformer  # optional dependency
    return SentenceTransformer(settings.EMBEDDING_MODEL)


def _backend() -> str:
    if settings.EMBEDDING_BACKEND == "tfidf":
        return "tfidf"
    if settings.EMBEDDING_BACKEND == "gemini":
        return "gemini" if settings.LLM_PROVIDER == "gemini" and settings.LLM_API_KEY else "tfidf"
    try:
        _sentence_model()
        return "sentence-transformers"
    except Exception:
        if settings.EMBEDDING_BACKEND == "sentence-transformers":
            raise
        return "tfidf"


def warm_up() -> None:
    try:
        _backend()
    except Exception:
        pass


def paper_text(p: dict) -> str:
    return f"{p['title']}. {p['title']}. {p.get('abstract', '')}"


def _gemini_similarities(project_text: str, docs: list[str]) -> list[float]:
    texts = [project_text] + docs
    vectors = []
    for i in range(0, len(texts), GEMINI_BATCH):
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_EMBEDDING_MODEL}:batchEmbedContents",
            headers={"x-goog-api-key": settings.LLM_API_KEY},
            json={"requests": [
                {"model": f"models/{GEMINI_EMBEDDING_MODEL}", "taskType": "SEMANTIC_SIMILARITY", "content": {"parts": [{"text": t}]}}
                for t in texts[i:i + GEMINI_BATCH]
            ]},
            timeout=60.0,
        )
        r.raise_for_status()
        vectors += [e["values"] for e in r.json()["embeddings"]]
    v = np.array(vectors)
    v = v / np.linalg.norm(v, axis=1, keepdims=True)
    slope, intercept = GEMINI_TO_MINILM
    return (slope * (v[1:] @ v[0]) + intercept).tolist()


def score_papers(project_text: str, papers: list[dict]) -> tuple[list[float], str]:
    if not papers:
        return [], _backend()
    docs = [paper_text(p) for p in papers]
    backend = _backend()

    if backend == "gemini":
        try:
            sims = _gemini_similarities(project_text, docs)
            return [float(np.clip(s, 0.0, 1.0)) for s in sims], backend
        except (httpx.HTTPError, KeyError, ValueError) as e:
            # Report only the type: the error text can include the request details
            print(f"Gemini embeddings unavailable ({type(e).__name__}); using TF-IDF")
            backend = "tfidf"

    if backend == "sentence-transformers":
        model = _sentence_model()
        vecs = model.encode([project_text] + docs, normalize_embeddings=True)
        sims = (vecs[1:] @ vecs[0]).tolist()
    else:
        vec = TfidfVectorizer(analyzer=analyze, sublinear_tf=True)
        matrix = vec.fit_transform([project_text] + docs)
        sims = cosine_similarity(matrix[0], matrix[1:]).ravel().tolist()

    return [float(np.clip(s, 0.0, 1.0)) for s in sims], backend


def shared_terms(project_text: str, paper: dict, k: int = 6) -> list[str]:
    project_terms = set(tokenize(project_text))
    seen: list[str] = []
    for t in tokenize(paper_text(paper)):
        if t in project_terms and t not in seen:
            seen.append(t)
    return seen[:k]
