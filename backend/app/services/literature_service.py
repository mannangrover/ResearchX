"""Stage 3 — retrieve related papers from OpenAlex, Semantic Scholar and arXiv."""
import hashlib
import json
import re
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from ..config import settings
from .text_utils import tokenize

S2_SEARCH = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_FIELDS = "title,abstract,year,authors,citationCount,venue,url,externalIds"
ARXIV_API = "https://export.arxiv.org/api/query"
ATOM = {"a": "http://www.w3.org/2005/Atom"}

# arXiv asks clients to wait ~3 s between requests and answers bursts with 429s / timeouts
ARXIV_MIN_INTERVAL = 3.1
_arxiv_lock = threading.Lock()
_arxiv_last_call = 0.0

# Successful searches are cached so re-runs (and demos) don't depend on the APIs responding
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "literature"
CACHE_HOURS = 24


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def search_semantic_scholar(query: str, limit: int) -> list[dict]:
    headers = {"User-Agent": "ResearchX"}
    if settings.SEMANTIC_SCHOLAR_API_KEY:
        headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_API_KEY
    params = {"query": query[:300], "limit": limit, "fields": S2_FIELDS}

    for attempt in range(2):  # the keyless API rate-limits aggressively
        r = httpx.get(S2_SEARCH, params=params, headers=headers, timeout=20.0)
        if r.status_code == 429:
            time.sleep(1.5)
            continue
        r.raise_for_status()
        break
    else:
        raise RuntimeError("rate limited, try again in a minute")

    papers = []
    for p in r.json().get("data", []) or []:
        if not p.get("title"):
            continue
        ext = p.get("externalIds") or {}
        papers.append({
            "title": p["title"].strip(),
            "abstract": (p.get("abstract") or "").strip(),
            "year": p.get("year"),
            "authors": [a["name"] for a in (p.get("authors") or [])][:6],
            "venue": p.get("venue") or "",
            "citations": p.get("citationCount") or 0,
            "url": p.get("url") or (f"https://doi.org/{ext['DOI']}" if ext.get("DOI") else ""),
            "arxiv_id": ext.get("ArXiv"),
            "source": "Semantic Scholar",
        })
    return papers


OPENALEX_WORKS = "https://api.openalex.org/works"


def _openalex_abstract(inverted: dict | None) -> str:
    if not inverted:
        return ""
    positions = [(i, w) for w, idx in inverted.items() for i in idx]
    return " ".join(w for _, w in sorted(positions))


def search_openalex(query: str, limit: int) -> list[dict]:
    params = {"api_key": settings.OPENALEX_API_KEY} if settings.OPENALEX_API_KEY else {}
    r = httpx.get(OPENALEX_WORKS, params={
        **params,
        "search": query[:300],
        "per-page": limit,
        "filter": "has_abstract:true",
        "select": "id,doi,title,publication_year,cited_by_count,abstract_inverted_index,authorships,primary_location",
    }, headers={"User-Agent": "ResearchX"}, timeout=25.0)
    r.raise_for_status()
    papers = []
    for w in r.json().get("results", []):
        if not w.get("title"):
            continue
        source = ((w.get("primary_location") or {}).get("source") or {})
        papers.append({
            "title": re.sub(r"<[^>]+>", "", w["title"]).strip(),
            "abstract": _openalex_abstract(w.get("abstract_inverted_index")),
            "year": w.get("publication_year"),
            "authors": [a["author"]["display_name"] for a in w.get("authorships", [])[:6] if a.get("author")],
            "venue": source.get("display_name") or "",
            "citations": w.get("cited_by_count") or 0,
            "url": w.get("doi") or w.get("id"),
            "arxiv_id": None,
            "source": "OpenAlex",
        })
    return papers


def _arxiv_query(terms: list[str]) -> str:
    return " AND ".join(f'all:"{t}"' if " " in t else f"all:{t}" for t in terms)


def _arxiv_get(client: httpx.Client, params: dict) -> httpx.Response:
    """Throttled arXiv request with retries on rate limits, server errors and timeouts."""
    global _arxiv_last_call
    last_error: Exception | None = None
    for attempt in range(2):
        with _arxiv_lock:
            wait = ARXIV_MIN_INTERVAL - (time.monotonic() - _arxiv_last_call)
            if wait > 0:
                time.sleep(wait)
            _arxiv_last_call = time.monotonic()
        try:
            r = client.get(ARXIV_API, params=params)
        except httpx.TransportError as e:  # timeout / connection reset
            last_error = e
        else:
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
                return r
            last_error = httpx.HTTPStatusError(f"arXiv HTTP {r.status_code}", request=r.request, response=r)
        if attempt == 0:
            time.sleep(2)
    raise last_error


def search_arxiv(query: str, limit: int) -> list[dict]:
    terms = list(dict.fromkeys(tokenize(query)))[:4]
    if not terms:
        return []
    entries: list = []
    # Try the 4 most specific terms, then relax to 2 if arXiv finds nothing (at most 2 requests)
    # Short timeout: OpenAlex covers the same papers, so a slow arXiv must not stall the whole stage
    with httpx.Client(timeout=12.0, follow_redirects=True) as client:
        for n in dict.fromkeys([len(terms), min(2, len(terms))]):
            r = _arxiv_get(client, {
                "search_query": _arxiv_query(terms[:n]),
                "max_results": limit,
                "sortBy": "relevance",
            })
            entries = ET.fromstring(r.text).findall("a:entry", ATOM)
            if entries:
                break

    papers = []
    for e in entries:
        title = re.sub(r"\s+", " ", e.findtext("a:title", "", ATOM)).strip()
        if not title:
            continue
        published = e.findtext("a:published", "", ATOM)
        link = e.findtext("a:id", "", ATOM)
        papers.append({
            "title": title,
            "abstract": re.sub(r"\s+", " ", e.findtext("a:summary", "", ATOM)).strip(),
            "year": int(published[:4]) if published[:4].isdigit() else None,
            "authors": [a.findtext("a:name", "", ATOM) for a in e.findall("a:author", ATOM)][:6],
            "venue": "arXiv",
            "citations": None,
            "url": link,
            "arxiv_id": link.rsplit("/abs/", 1)[-1] if "/abs/" in link else None,
            "source": "arXiv",
        })
    return papers


def _cache_file(source: str, query: str, limit: int) -> Path:
    key = hashlib.sha1(f"{source}|{query.strip().lower()}|{limit}".encode()).hexdigest()[:20]
    return CACHE_DIR / f"{key}.json"


def _cache_get(source: str, query: str, limit: int) -> list[dict] | None:
    f = _cache_file(source, query, limit)
    if f.exists() and time.time() - f.stat().st_mtime < CACHE_HOURS * 3600:
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):  # damaged file (e.g. written while the disk was full)
            f.unlink(missing_ok=True)
    return None


def _cache_put(source: str, query: str, limit: int, papers: list[dict]) -> None:
    if not papers:  # never cache an empty result, it may be a transient failure
        return
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        target = _cache_file(source, query, limit)
        tmp = target.with_suffix(".tmp")
        tmp.write_text(json.dumps(papers), encoding="utf-8")
        tmp.replace(target)  # atomic: never leaves a half-written cache file
    except OSError:
        pass  # caching is best-effort


def _search_source(name: str, fn, queries: list[str], limit: int) -> tuple[list[dict], str | None]:
    """Run all queries on one source; stop at the first failure (usually a rate limit)."""
    found: list[dict] = []
    for q in queries:
        cached = _cache_get(name, q, limit)
        if cached is not None:
            found += cached
            continue
        try:
            result = fn(q, limit)
            _cache_put(name, q, limit, result)
            found += result
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            return found, f"{name}: HTTP {code}" + (" (rate limited, try again in a minute)" if code == 429 else "")
        except Exception as e:
            return found, f"{name}: {e or type(e).__name__}"
    return found, None


def retrieve_papers(queries: list[str]) -> dict:
    """Query all sources in parallel, then merge and de-duplicate by title."""
    limit = settings.MAX_PAPERS_PER_SOURCE
    sources = (("OpenAlex", search_openalex), ("Semantic Scholar", search_semantic_scholar), ("arXiv", search_arxiv))
    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        results = list(pool.map(lambda src: _search_source(*src, queries[:3], limit), sources))

    merged: dict[str, dict] = {}
    per_source: dict[str, int] = {}
    errors: list[str] = []
    for (name, _), (found, error) in zip(sources, results):
        per_source[name] = len(found)
        if error:
            errors.append(error)
        for p in found:
            key = _norm_title(p["title"])
            if key in merged:
                # Keep citation counts / arXiv ids from whichever source has them, and the longer abstract
                old = merged[key]
                if old["citations"] is None and p["citations"] is not None:
                    old["citations"], old["venue"] = p["citations"], p["venue"] or old["venue"]
                old["arxiv_id"] = old["arxiv_id"] or p["arxiv_id"]
                if len(p["abstract"]) > len(old["abstract"]):
                    old["abstract"] = p["abstract"]
            else:
                merged[key] = p

    return {"papers": list(merged.values()), "retrieved_per_source": per_source, "errors": errors}
