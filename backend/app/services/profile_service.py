"""Stage 2 — build a structured technical profile from the idea and/or repository."""
import re
from . import llm_service
from .github_service import analyze_repository
from .text_utils import clean_markdown, dedupe_words, extract_keywords, first_sentences

# Library name -> technique / area it signals. Used for the heuristic profile
# and for the technical-depth dimension of the score.
LIBRARY_TECHNIQUES = {
    "torch": "Deep Learning (PyTorch)", "pytorch": "Deep Learning (PyTorch)",
    "tensorflow": "Deep Learning (TensorFlow)", "keras": "Deep Learning (Keras)",
    "jax": "Deep Learning (JAX)", "transformers": "Transformer models",
    "sentence-transformers": "Semantic embeddings", "scikit-learn": "Classical ML",
    "sklearn": "Classical ML", "xgboost": "Gradient boosting", "lightgbm": "Gradient boosting",
    "opencv-python": "Computer Vision", "opencv": "Computer Vision", "torchvision": "Computer Vision",
    "ultralytics": "Object detection (YOLO)", "spacy": "NLP", "nltk": "NLP",
    "langchain": "LLM orchestration / RAG", "llama-index": "LLM orchestration / RAG",
    "openai": "LLM APIs", "anthropic": "LLM APIs", "faiss-cpu": "Vector search",
    "qdrant-client": "Vector search", "chromadb": "Vector search", "pinecone-client": "Vector search",
    "networkx": "Graph algorithms", "torch-geometric": "Graph neural networks",
    "gym": "Reinforcement learning", "gymnasium": "Reinforcement learning",
    "stable-baselines3": "Reinforcement learning", "pandas": "Data analysis",
    "numpy": "Numerical computing", "scipy": "Scientific computing",
    "fastapi": "Web backend", "flask": "Web backend", "django": "Web backend",
    "express": "Web backend", "react": "Web frontend", "next": "Web frontend", "vue": "Web frontend",
    "web3": "Blockchain", "ethers": "Blockchain", "hardhat": "Blockchain / smart contracts",
    "pyspark": "Distributed data processing", "kafka-python": "Streaming systems",
    "docker": "Containerisation", "kubernetes": "Container orchestration",
}

# Regex over idea/README text -> technique, for projects without dependency files
TEXT_TECHNIQUES = [
    (r"retrieval[- ]augmented|\brag\b", "Retrieval-Augmented Generation"),
    (r"large language model|\bllms?\b|gpt|chatgpt", "Large Language Models"),
    (r"transformer|bert\b", "Transformer models"),
    (r"embedding|vector (db|database|search)|semantic search", "Semantic embeddings / vector search"),
    (r"convolutional|\bcnn\b|image classification|object detection|segmentation", "Computer Vision"),
    (r"reinforcement learning|\brl agent|reward", "Reinforcement learning"),
    (r"graph neural|\bgnn\b|knowledge graph", "Graph learning / knowledge graphs"),
    (r"federated learning", "Federated learning"),
    (r"time[- ]series|forecast", "Time-series forecasting"),
    (r"recommend(er|ation)", "Recommender systems"),
    (r"static analysis|abstract syntax tree|\bast\b", "Program analysis"),
    (r"code review|pull request", "Automated code review"),
    (r"blockchain|smart contract", "Blockchain"),
    (r"\biot\b|sensor", "IoT / sensing"),
    (r"anomaly detection|intrusion detection", "Anomaly detection"),
    (r"speech|audio", "Speech / audio processing"),
    (r"sentiment|text classification|named entity|\bnlp\b|natural language", "NLP"),
    (r"multi[- ]agent|agentic|\bagents?\b", "LLM agents / multi-agent systems"),
]

SYSTEM = (
    "You are ResearchX, an assistant that helps students judge the research potential of "
    "software projects. Be concrete, technical and honest; never claim novelty."
)


def _detect_techniques(dependencies: dict[str, list[str]]) -> list[str]:
    found: list[str] = []
    for deps in dependencies.values():
        for d in deps:
            t = LIBRARY_TECHNIQUES.get(d.lower())
            if t and t not in found:
                found.append(t)
    return found


def _detect_text_techniques(text: str) -> list[str]:
    text = text.lower()
    return [name for pattern, name in TEXT_TECHNIQUES if re.search(pattern, text)]


def _heuristic_profile(title: str, idea: str, repo: dict | None, domain: str) -> dict:
    readme = clean_markdown(repo["readme"]) if repo else ""
    description = re.sub(r"[^\w\s,.:;()\-+/]", "", repo["description"]).strip() if repo else ""
    user_text = f"{title}. {idea}"
    repo_text = f"{description}. {' '.join(t.replace('-', ' ') for t in repo['topics'])}. {readme}" if repo else ""

    # The user's own words describe the research idea best; the README adds context
    idea_kw = extract_keywords(f"{title} {title} {idea}", 8)
    repo_kw = extract_keywords(repo_text, 8) if repo else []
    keywords = list(dict.fromkeys(idea_kw + repo_kw))[:12]

    techniques = _detect_text_techniques(f"{user_text} {repo_text}")
    if repo:
        techniques += [t for t in _detect_techniques(repo["dependencies"]) if t not in techniques]
    summary = first_sentences(idea) or description or first_sentences(readme)

    queries = []
    if idea_kw:
        queries.append(" ".join(idea_kw[:5]))
    if techniques:
        queries.append(f"{title} {techniques[0]}")
    else:
        queries.append(title)
    if repo_kw:
        queries.append(" ".join(repo_kw[:5]))

    queries = [dedupe_words(q) for q in queries]
    return {
        "summary": summary,
        "problem": first_sentences(idea, 1) or "Not stated — describe the problem in the idea text.",
        "approach": first_sentences(readme, 2) if readme else "Not stated.",
        "techniques": techniques,
        "keywords": keywords,
        "search_queries": list(dict.fromkeys(q for q in queries if q.strip()))[:3],
        "domain": domain or "Computer Science",
        "contribution_type": "unknown",
    }


def _llm_profile(title: str, idea: str, repo: dict | None, domain: str) -> dict:
    repo_block = ""
    if repo:
        repo_block = (
            f"\nREPOSITORY {repo['owner']}/{repo['name']}\n"
            f"Description: {repo['description']}\nTopics: {', '.join(repo['topics'])}\n"
            f"Languages: {', '.join(repo['languages'])}\n"
            f"Dependencies: {', '.join(d for v in repo['dependencies'].values() for d in v[:25])}\n"
            f"Top-level folders: {', '.join(repo['top_directories'])}\n"
            f"README (cleaned, truncated):\n{clean_markdown(repo['readme'])[:6000]}\n"
        )
    prompt = f"""Build a technical research profile of this project.

TITLE: {title}
DOMAIN (user-selected): {domain or 'not specified'}
IDEA / DESCRIPTION:
{idea or '(none given — rely on the repository)'}
{repo_block}
Return JSON with keys:
"summary" (2-3 sentences), "problem" (the problem being solved, 1-2 sentences),
"approach" (technical approach, 2-3 sentences), "techniques" (list of 3-8 concrete methods/algorithms/technologies),
"keywords" (list of 6-12 research keywords suitable for academic search),
"search_queries" (list of 3 short academic search queries, 4-10 words each, that would find the most closely related papers),
"domain" (specific CS sub-field), "contribution_type" (one of: system, algorithm, empirical-study, dataset, tool, application)."""
    data = llm_service.complete_json(SYSTEM, prompt, 1200)
    required = {"summary", "problem", "approach", "techniques", "keywords", "search_queries"}
    if not required <= data.keys():
        raise llm_service.LLMUnavailable("LLM profile missing fields")
    data.setdefault("domain", domain or "Computer Science")
    data.setdefault("contribution_type", "unknown")
    return data


def build_profile(title: str, idea: str, github_url: str, domain: str) -> dict:
    repo = analyze_repository(github_url) if github_url else None

    method, note = "heuristic", None
    try:
        profile = _llm_profile(title, idea, repo, domain)
        method = "llm"
    except llm_service.LLMUnavailable as e:
        profile = _heuristic_profile(title, idea, repo, domain)
        note = str(e)

    if repo:
        # Merge library-detected techniques with whatever the LLM found
        detected = _detect_techniques(repo["dependencies"])
        profile["techniques"] = list(dict.fromkeys(list(profile.get("techniques", [])) + detected))
        repo = {
            **repo,
            "readme_excerpt": clean_markdown(repo["readme"])[:1500],
            "readme_length": len(repo["readme"]),
        }
        repo.pop("readme")

    return {"method": method, "note": note, "profile": profile, "repository": repo}
