"""Semantic similarity between the project and retrieved papers.

Uses Sentence Transformers when installed (pip install sentence-transformers),
otherwise TF-IDF cosine similarity, so the prototype runs with no GPU / torch.
"""
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings
from .text_utils import analyze, tokenize


@lru_cache(maxsize=1)
def _sentence_model():
    from sentence_transformers import SentenceTransformer  # optional dependency
    return SentenceTransformer(settings.EMBEDDING_MODEL)


def _backend() -> str:
    if settings.EMBEDDING_BACKEND == "tfidf":
        return "tfidf"
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


def score_papers(project_text: str, papers: list[dict]) -> tuple[list[float], str]:
    if not papers:
        return [], _backend()
    docs = [paper_text(p) for p in papers]
    backend = _backend()

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
