"""Stage 2a — GitHub repository analysis via the GitHub REST API."""
import json
import re
import time
from datetime import datetime
from collections import Counter
from pathlib import Path, PurePosixPath

import httpx

from ..config import settings

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"

CODE_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".kt", ".go", ".rs", ".c", ".cc",
    ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift", ".scala", ".m", ".r",
    ".jl", ".dart", ".lua", ".sh", ".ipynb", ".sql", ".vue", ".svelte",
}
DEP_FILES = {
    "requirements.txt", "pyproject.toml", "setup.py", "environment.yml",
    "package.json", "pom.xml", "build.gradle", "go.mod", "cargo.toml", "gemfile",
}
README_LIMIT = 12000
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "github"
CACHE_HOURS = 24


class GitHubError(Exception):
    pass


def parse_repo_url(url: str) -> tuple[str, str]:
    m = re.search(r"github\.com[/:]([\w.-]+)/([\w.-]+?)(?:\.git)?(?:[/?#]|$)", url.strip())
    if not m:
        raise GitHubError("Not a valid GitHub repository URL (expected github.com/<owner>/<repo>)")
    return m.group(1), m.group(2)


def _headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "ResearchX"}
    if settings.GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return h


def _get(client: httpx.Client, url: str, **kw) -> httpx.Response:
    r = client.get(url, headers=_headers(), **kw)
    if r.status_code == 404:
        raise GitHubError("Repository not found (or it is private)")
    if r.status_code in (403, 429) and "rate limit" in r.text.lower():
        reset = r.headers.get("x-ratelimit-reset")
        when = f" It resets at {datetime.fromtimestamp(int(reset)):%H:%M}." if reset else ""
        raise GitHubError(
            "GitHub API rate limit reached." + when
            + " Try again later."
        )
    r.raise_for_status()
    return r


def _parse_dependencies(name: str, text: str) -> list[str]:
    name = name.lower()
    deps: list[str] = []
    if name == "requirements.txt":
        for line in text.splitlines():
            line = line.split("#")[0].strip()
            if line and not line.startswith("-"):
                deps.append(re.split(r"[<>=!~\[;\s]", line)[0])
    elif name == "package.json":
        try:
            pkg = json.loads(text)
            deps += list(pkg.get("dependencies", {})) + list(pkg.get("devDependencies", {}))
        except json.JSONDecodeError:
            pass
    elif name == "pyproject.toml":
        block = re.search(r"dependencies\s*=\s*\[(.*?)\]", text, re.S)
        if block:
            deps += [re.split(r"[<>=!~\[;\s]", d)[0] for d in re.findall(r"['\"]([^'\"]+)['\"]", block.group(1))]
        deps += re.findall(r"^\s*([A-Za-z0-9_.-]+)\s*=\s*[\"{]", text.split("[tool.poetry.dependencies]")[-1], re.M) \
            if "[tool.poetry.dependencies]" in text else []
    elif name == "go.mod":
        deps += re.findall(r"^\s*([\w.\-/]+\.[\w.\-/]+)\s+v", text, re.M)
    elif name == "pom.xml":
        deps += re.findall(r"<artifactId>([^<]+)</artifactId>", text)[1:]
    elif name == "cargo.toml":
        block = text.split("[dependencies]")[-1] if "[dependencies]" in text else ""
        deps += re.findall(r"^\s*([A-Za-z0-9_-]+)\s*=", block.split("\n[")[0], re.M)
    return [d for d in dict.fromkeys(d.strip() for d in deps) if d and d.lower() != "python"]


def _cache_path(owner: str, repo: str) -> Path:
    return CACHE_DIR / f"{owner.lower()}__{repo.lower()}.json"


def analyze_repository(url: str) -> dict:
    """Analyse a repository, reusing a cached result for CACHE_HOURS to save API quota."""
    owner, repo = parse_repo_url(url)
    cache = _cache_path(owner, repo)
    if cache.exists() and time.time() - cache.stat().st_mtime < CACHE_HOURS * 3600:
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):  # damaged cache file
            cache.unlink(missing_ok=True)
    result = _fetch_repository(owner, repo)
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = cache.with_suffix(".tmp")
        tmp.write_text(json.dumps(result), encoding="utf-8")
        tmp.replace(cache)
    except OSError:
        pass  # caching is best-effort
    return result


def _fetch_repository(owner: str, repo: str) -> dict:
    # Only 3 calls hit the rate-limited REST API (metadata, languages, file tree);
    # README and dependency files come from raw.githubusercontent.com, which is not rate-limited.
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        meta = _get(client, f"{API}/repos/{owner}/{repo}").json()
        branch = meta.get("default_branch", "main")
        languages = _get(client, f"{API}/repos/{owner}/{repo}/languages").json()

        tree = _get(client, f"{API}/repos/{owner}/{repo}/git/trees/{branch}", params={"recursive": "1"}).json()
        paths = [t["path"] for t in tree.get("tree", []) if t.get("type") == "blob"]

        readme = ""
        readme_path = next((p for p in sorted(paths, key=len) if "/" not in p and p.lower().startswith("readme")), None)
        if readme_path:
            r = client.get(f"{RAW}/{owner}/{repo}/{branch}/{readme_path}")
            if r.status_code == 200:
                readme = r.text[:README_LIMIT]

        dependencies: dict[str, list[str]] = {}
        for p in paths:
            fname = PurePosixPath(p).name
            if fname.lower() in DEP_FILES and p.count("/") <= 1 and len(dependencies) < 5:
                raw = client.get(f"{RAW}/{owner}/{repo}/{branch}/{p}")
                if raw.status_code == 200:
                    parsed = _parse_dependencies(fname, raw.text)
                    if parsed:
                        dependencies[p] = parsed[:60]

    lower_paths = [p.lower() for p in paths]
    ext_counts = Counter(PurePosixPath(p).suffix.lower() for p in paths)
    code_files = sum(n for ext, n in ext_counts.items() if ext in CODE_EXTS)
    top_dirs = Counter(p.split("/")[0] for p in paths if "/" in p)

    signals = {
        "has_tests": any(re.search(r"(^|/)(tests?|__tests__|spec)(/|$)|test_.*\.py$|\.test\.[jt]sx?$", p) for p in lower_paths),
        "has_ci": any(p.startswith(".github/workflows/") or p in (".travis.yml", ".gitlab-ci.yml") for p in lower_paths),
        "has_docs": any(p.startswith(("docs/", "doc/")) for p in lower_paths),
        "has_license": bool(meta.get("license")) or any(p.startswith("license") for p in lower_paths),
        "has_dockerfile": any(PurePosixPath(p).name == "dockerfile" for p in lower_paths),
        "has_notebooks": ext_counts.get(".ipynb", 0) > 0,
        "has_dependency_file": bool(dependencies),
    }

    return {
        "owner": owner,
        "name": repo,
        "url": meta.get("html_url"),
        "description": meta.get("description") or "",
        "topics": meta.get("topics", []),
        "stars": meta.get("stargazers_count", 0),
        "forks": meta.get("forks_count", 0),
        "open_issues": meta.get("open_issues_count", 0),
        "license": (meta.get("license") or {}).get("spdx_id"),
        "created_at": meta.get("created_at"),
        "pushed_at": meta.get("pushed_at"),
        "default_branch": branch,
        "languages": languages,
        "readme": readme,
        "file_count": len(paths),
        "code_file_count": code_files,
        "top_directories": [d for d, _ in top_dirs.most_common(12)],
        "dependencies": dependencies,
        "signals": signals,
        "tree_truncated": tree.get("truncated", False),
    }
