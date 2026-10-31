"""Small text helpers shared by the analysis services."""
import re
from collections import Counter

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

# Words that are common in READMEs / proposals but carry no research meaning
DOMAIN_STOP = {
    "use", "using", "used", "based", "project", "system", "app", "application", "code", "run",
    "install", "pip", "npm", "file", "files", "example", "examples", "license", "readme",
    "github", "http", "https", "www", "com", "org", "io", "md", "png", "jpg", "svg", "img",
    "src", "py", "js", "json", "yaml", "yml", "txt", "docs", "documentation", "version",
    "new", "make", "makes", "user", "users", "support", "supports", "data", "provide", "provides",
    "build", "built", "simple", "easy", "feature", "features", "want", "also", "like", "just",
    "need", "work", "works", "way", "help", "helps", "get", "set", "start", "step", "steps",
    "propose", "proposed", "paper", "approach", "method", "methods", "model", "models",
    "idea", "research", "students", "able", "allow", "allows", "different", "various",
}
STOP = ENGLISH_STOP_WORDS | DOMAIN_STOP


def clean_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)          # code blocks
    text = re.sub(r"<[^>]+>", " ", text)                          # html tags
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)             # images / badges
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)          # links -> text
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[#>*_`|~=-]{2,}", " ", text)
    text = re.sub(r"^[#>\-*+\s]+", "", text, flags=re.M)
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9+\-]{2,}", text.lower()) if w not in STOP]


_SUFFIXES = ("ations", "ation", "ments", "ment", "ings", "ing", "ies", "ers", "er", "ed", "es", "s")


def stem(word: str) -> str:
    """Very light suffix stripping so 'reviews'/'reviewing'/'reviewer' match."""
    for suf in _SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 4:
            return word[: -len(suf)] + ("y" if suf == "ies" else "")
    return word


def analyze(text: str) -> list[str]:
    """Tokenizer for TF-IDF: stemmed unigrams plus stemmed bigrams."""
    toks = [stem(t) for part in tokenize(text) for t in part.split("-") if len(t) > 2 and t not in STOP]
    return toks + [f"{a} {b}" for a, b in zip(toks, toks[1:])]


def dedupe_words(text: str) -> str:
    seen, out = set(), []
    for w in text.split():
        if w.lower() not in seen:
            seen.add(w.lower())
            out.append(w)
    return " ".join(out)


def extract_keywords(text: str, k: int = 12) -> list[str]:
    """Frequency-based keyphrases: bigrams that repeat are preferred over unigrams."""
    tokens = tokenize(text)
    if not tokens:
        return []
    unigrams = Counter(tokens)
    bigrams = Counter(f"{a} {b}" for a, b in zip(tokens, tokens[1:]) if a != b)
    phrases = [(p, c * 2.2) for p, c in bigrams.items() if c >= 2]
    scored = sorted(phrases + list(unigrams.items()), key=lambda x: -x[1])
    out: list[str] = []
    for phrase, _ in scored:
        if any(phrase in o or o in phrase for o in out):
            continue
        out.append(phrase)
        if len(out) == k:
            break
    return out


def first_sentences(text: str, n: int = 2, limit: int = 400) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])[:limit]
