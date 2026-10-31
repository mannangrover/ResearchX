"""Stage 8 — Paper evaluation.

The student implements the research (ideally following the stage 7 plan),
writes the paper and uploads it (PDF, Word, LaTeX, Markdown or text).
ResearchX does not write the paper; it evaluates it in two separate parts:

  1. Review — the paper on its own merits: contribution, methodology,
     results, clarity, references and reproducibility -> a paper score.
     Following or not following the plan does not change this score.
  2. Research journey — how the paper relates to the project's history:
     differentiation from the closest papers (stage 3), research gaps
     addressed (stage 5), research questions answered (stage 6) and what was
     done / changed / not done from the experiment plan (stage 7), with
     whether each change made the work stronger or weaker. Informational.

Text checks are deterministic; the judgements use the LLM with a fallback
estimated from the deterministic checks. Only the evaluation is stored, not
the paper text.
"""
import html
import io
import re
import zipfile
from datetime import datetime, timezone

from fastapi import HTTPException

from . import llm_service
from .experiment_service import active_proposal

MAX_BYTES = 15 * 1024 * 1024
EXTENSIONS = {"pdf", "docx", "tex", "md", "txt"}

SECTION_PATTERNS = [
    ("abstract", r"abstract"),
    ("introduction", r"introduction"),
    ("related", r"related work|background|literature review|prior work|related literature"),
    ("method", r"method(?:s|ology)?|approach|proposed (?:method|approach|system|framework)|system (?:design|architecture)|framework|model"),
    ("experiments", r"experiments?|experimental (?:setup|design|evaluation)|evaluation(?: setup)?|implementation(?: details)?|setup"),
    ("results", r"results?(?: and discussion| and analysis)?|findings"),
    ("discussion", r"discussion|analysis|limitations|threats to validity"),
    ("conclusion", r"conclusions?(?: and future work)?|future work|summary"),
    ("references", r"references|bibliography"),
]
SECTION_NAMES = {"abstract": "Abstract", "introduction": "Introduction", "related": "Related work",
                 "method": "Method", "experiments": "Experiments", "results": "Results",
                 "discussion": "Discussion", "conclusion": "Conclusion", "references": "References"}
REQUIRED = ["abstract", "introduction", "related", "method", "experiments", "results", "conclusion", "references"]

REPRO_CHECKS = [
    ("code", "Code is available (link to a repository)", r"github\.com|gitlab\.com|code (?:is|will be) (?:publicly )?available|source code"),
    ("data", "Datasets are named and their source given", r"dataset|corpus|benchmark"),
    ("seeds", "Random seeds / repeated runs reported", r"\bseeds?\b|random seed|\bruns\b|repeated|averaged over"),
    ("hardware", "Hardware / compute described", r"\bgpu\b|\bcpu\b|nvidia|\bram\b|hardware|colab|cluster"),
    ("hyperparams", "Hyperparameters reported", r"learning rate|batch size|epochs?|hyper-?parameters?|optimi[sz]er"),
    ("variance", "Variance or statistical test reported", r"±|\+/-|std\.?|standard deviation|confidence interval|p\s*[<=>]\s*0?\.\d|t-test|wilcoxon|significance test"),
]

CLAIM_WORDS = r"significant(?:ly)?|state[- ]of[- ]the[- ]art|outperform\w*|novel|first to|superior|dramatic(?:ally)?|substantial(?:ly)?"

CRITERIA = [  # (key, name, weight) — LLM-judged part of the paper score
    ("contribution", "Contribution & novelty", 20),
    ("methodology", "Methodology", 20),
    ("results", "Results & evidence", 20),
    ("clarity", "Clarity & structure", 15),
]

REVIEWER_SYSTEM = (
    "You are ResearchX's paper evaluator for student research papers. First judge the paper on its own merits, "
    "like a fair conference reviewer. Then relate it to the project's history (closest papers, research gaps, "
    "research questions, experiment plan) as information for the student: changing the plan is allowed, so judge "
    "whether each change made the work stronger or weaker instead of penalising it. Quote or point to the paper "
    "for every judgement. Respond with JSON only."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ text extraction
def extract_text(filename: str, data: bytes) -> tuple[str, int | None]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in EXTENSIONS:
        raise HTTPException(415, "Upload a PDF, Word (.docx), LaTeX (.tex), Markdown or text file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 15 MB")
    pages = None
    try:
        if ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            pages = len(reader.pages)
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif ext == "docx":
            xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf8")
            xml = re.sub(r"</w:p>", "\n", xml)
            xml = re.sub(r"<w:tab/>", " ", xml)
            text = html.unescape(re.sub(r"<[^>]+>", "", xml))
        else:
            text = data.decode("utf8", errors="replace")
            if ext == "tex":
                text = _latex_to_text(text)
    except HTTPException:
        raise
    except Exception as e:  # corrupt or encrypted files
        raise HTTPException(422, f"Could not read the file: {e}") from e
    text = re.sub(r"[ \t]+", " ", text.replace("\r", ""))
    if len(text.split()) < 300:
        raise HTTPException(422, "Too little text could be extracted (is the PDF a scanned image?). Upload a text-based PDF, .docx or .tex file.")
    return text, pages


def _latex_to_text(src: str) -> str:
    src = re.sub(r"(?<!\\)%.*", "", src)
    src = re.sub(r"\\begin\{abstract\}", "\nAbstract\n", src)
    src = re.sub(r"\\(?:sub)*section\*?\{([^}]*)\}", r"\n\1\n", src)
    src = re.sub(r"\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}", r"\n[BIB:\1] ", src)
    src = re.sub(r"\\begin\{thebibliography\}.*?\n", "\nReferences\n", src)
    return src


# ------------------------------------------------------------------ structure
def split_sections(text: str) -> list[dict]:
    """Find section headings (numbered or not) and return [{key, title, text}] in order."""
    names = "|".join(f"(?P<{k}>{p})" for k, p in SECTION_PATTERNS)
    heading = re.compile(rf"^\s*(?:[0-9]+(?:\.[0-9]+)*\.?|[IVX]+\.)?\s*(?:{names})\s*[:.—–-]?\s*(?P<rest>.*)$", re.I)
    found = []
    lines = text.split("\n")
    offsets, pos = [], 0
    for line in lines:
        offsets.append(pos)
        pos += len(line) + 1
    for i, line in enumerate(lines):
        if len(line) > 160:
            continue
        m = heading.match(line)
        if not m:
            continue
        key = next(k for k, _ in SECTION_PATTERNS if m.group(k))
        rest = m.group("rest").strip()
        # A heading line holds only the section name; "Abstract—We propose…" (IEEE style) is the exception
        if rest and key != "abstract":
            continue
        if any(f["key"] == key for f in found):
            continue  # keep the first occurrence
        found.append({"key": key, "title": line.strip()[:80], "start": offsets[i] + (m.start("rest") if rest else len(line))})
    found.sort(key=lambda f: f["start"])
    sections = []
    for i, f in enumerate(found):
        end = found[i + 1]["start"] if i + 1 < len(found) else len(text)
        sections.append({"key": f["key"], "title": f["title"], "text": text[f["start"]:end].strip()})
    if not any(s["key"] == "abstract" for s in sections):
        first = found[0]["start"] if found else len(text)
        sections.insert(0, {"key": "front", "title": "Front matter", "text": text[:first].strip()})
    return sections


def _section(sections: list[dict], *keys: str) -> str:
    return "\n".join(s["text"] for s in sections if s["key"] in keys)


def _words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.replace("\n", " ")) if s.strip()]


# ------------------------------------------------------------------ references
def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 3}


def analyse_references(sections: list[dict], body: str, related_papers: list[dict]) -> dict:
    ref_text = _section(sections, "references")
    entries = [e.strip() for e in re.split(r"\n\s*\[(?:\d+|BIB:[^\]]+)\]\s*", "\n" + ref_text) if len(e.strip()) > 15]
    if len(entries) < 3:
        entries = [e.strip() for e in re.split(r"\n\s*\d{1,3}\.\s+", "\n" + ref_text) if len(e.strip()) > 15]
    if len(entries) < 3:
        entries = [e.strip() for e in ref_text.split("\n") if len(e.strip()) > 30]

    numeric = re.findall(r"\[(\d+(?:\s*[,–-]\s*\d+)*)\]", body)
    cited: set[int] = set()
    for group in numeric:
        for part in re.split(r"\s*,\s*", group):
            if re.search(r"[–-]", part):
                a, b = (int(x) for x in re.split(r"\s*[–-]\s*", part)[:2])
                if 0 < a <= b < a + 50:
                    cited.update(range(a, b + 1))
            elif part.strip().isdigit():
                cited.add(int(part))
    latex_cites = re.findall(r"\\cite[pt]?\{([^}]*)\}", body)
    author_year = re.findall(r"\([A-Z][A-Za-z-]+(?: et al\.)?,? (?:19|20)\d{2}[a-z]?\)", body)

    if latex_cites:
        style = "latex"
        keys = {k.strip() for group in latex_cites for k in group.split(",")}
        bib = set(re.findall(r"\[BIB:([^\]]+)\]", ref_text))
        missing = sorted(keys - bib) if bib else []
        uncited = sorted(bib - keys) if bib else []
        cited_count = len(keys)
    elif cited:
        style = "numeric"
        n = len(entries)
        missing = sorted(c for c in cited if c > n) if n else []
        uncited = sorted(set(range(1, n + 1)) - cited) if n else []
        cited_count = len(cited)
    else:
        style = "author-year" if author_year else "none"
        missing, uncited, cited_count = [], [], len(author_year)

    ref_tokens = [_tokens(e) for e in entries] or [_tokens(ref_text)]
    coverage = []
    for p in related_papers[:8]:
        title = _tokens(p["title"])
        hit = bool(title) and any(len(title & r) / len(title) >= 0.6 for r in ref_tokens)
        coverage.append({"title": p["title"], "year": p.get("year"), "similarity": p.get("similarity"), "cited": hit})

    return {"count": len(entries), "style": style, "cited": cited_count,
            "missing": [str(m) for m in missing][:20], "uncited": [str(u) for u in uncited][:20],
            "related_coverage": coverage}


# ------------------------------------------------------------------ deterministic quality checks
def quality_checks(sections: list[dict], body: str) -> dict:
    present = {s["key"] for s in sections}
    abstract = _section(sections, "abstract") or _section(sections, "front")[:2500]
    abstract_words = _words(abstract)
    claims = []
    for s in _sentences(body):
        if re.search(CLAIM_WORDS, s, re.I) and not re.search(r"\d|\[\d|\\cite|\([A-Z][a-z]+.*\d{4}\)", s):
            claims.append(s[:220])
    return {
        "words": _words(body),
        "missing_sections": [k for k in REQUIRED if k not in present],
        "abstract_words": abstract_words,
        "abstract_has_numbers": bool(re.search(r"\d+(?:\.\d+)?\s*%|\d+\.\d+", abstract)),
        "figures": len(set(re.findall(r"\b(?:fig\.?|figure)\s*(\d+)", body, re.I))),
        "tables": len(set(re.findall(r"\btable\s*(\d+|[IVX]+)\b", body, re.I))),
        "unsupported_claims": claims[:6],
        "unsupported_claim_count": len(claims),
    }


def reproducibility(body: str) -> list[dict]:
    out = []
    for key, label, pattern in REPRO_CHECKS:
        m = re.search(pattern, body, re.I)
        evidence = ""
        if m:
            a, b = max(0, m.start() - 70), min(len(body), m.end() + 70)
            evidence = "…" + re.sub(r"\s+", " ", body[a:b]).strip() + "…"
        out.append({"key": key, "label": label, "ok": bool(m), "evidence": evidence})
    return out


# ------------------------------------------------------------------ project history the paper is compared with
def plan_items(plan: dict | None) -> list[dict]:
    if not plan:
        return []
    items = [{"id": h["id"], "kind": "Hypothesis", "label": h["statement"]} for h in plan["hypotheses"]]
    items += [{"id": e["id"], "kind": "Experiment", "label": f"{e['title']}: {e['setup']}"} for e in plan["experiments"]]
    items += [{"id": f"D{i}", "kind": "Dataset", "label": d["name"]} for i, d in enumerate(plan["datasets"], 1)]
    items += [{"id": f"B{i}", "kind": "Baseline", "label": b["name"]} for i, b in enumerate(plan["baselines"], 1)]
    items += [{"id": f"M{i}", "kind": "Metric", "label": m["name"]} for i, m in enumerate(plan["metrics"], 1)]
    items += [{"id": f"A{i}", "kind": "Ablation", "label": a} for i, a in enumerate(plan["ablations"], 1)]
    return items


def research_questions(project: dict) -> list[dict]:
    proposal, _ = active_proposal(project)
    rqs = (proposal or {}).get("research_questions") or project["score"].get("research_questions", [])
    return [{"id": f"RQ{i}", "question": q} for i, q in enumerate(rqs, 1)]


def research_gaps(project: dict) -> list[dict]:
    return [{"id": f"G{i}", "title": g["title"], "description": g.get("description", "")}
            for i, g in enumerate(project["score"].get("gaps", []), 1)]


def _paper_excerpt(sections: list[dict], limit: int = 20000) -> str:
    budget = {"abstract": 2000, "front": 1500, "introduction": 2500, "related": 1500, "method": 3500,
              "experiments": 4000, "results": 4000, "discussion": 1800, "conclusion": 1500}
    parts = [f"## {SECTION_NAMES.get(s['key'], s['title'])}\n{s['text'][:budget[s['key']]]}" for s in sections if s["key"] in budget]
    return "\n\n".join(parts)[:limit]


# ------------------------------------------------------------------ judgement (LLM, with a fallback)
def _llm_judge(project: dict, history: dict, sections: list[dict], note: str) -> dict:
    papers = "\n".join(f"- {p['title']} ({p.get('year')})" for p in project["literature"]["papers"][:5])
    gaps = "\n".join(f"{g['id']}: {g['title']} — {g['description'][:200]}" for g in history["gaps"])
    rqs = "\n".join(f"{q['id']}: {q['question']}" for q in history["rqs"])
    plan = "\n".join(f"{i['id']} [{i['kind']}]: {i['label'][:250]}" for i in history["plan"]) or "(no experiment plan was made)"
    prompt = f"""PROJECT HISTORY (what ResearchX produced before the paper was written)
CLOSEST RELATED PAPERS (stage 3):
{papers}
RESEARCH GAPS (stage 5):
{gaps or '(none)'}
RESEARCH QUESTIONS (stage 6):
{rqs or '(none)'}
EXPERIMENT PLAN (stage 7):
{plan}
STUDENT'S NOTE ON CHANGES: {note or '(none)'}

PAPER (excerpts by section):
{_paper_excerpt(sections)}

Return JSON:
"review": {{"contribution": {{"score": 0-10, "comment": one sentence}}, "methodology": {{...}}, "results": {{...}}, "clarity": {{...}}}}
  — judge the paper ONLY on its own merits; following or changing the plan must not affect these scores,
"summary": 3-4 sentences judging the paper itself,
"strengths": [2-4 short strengths],
"fixes": [{{"priority": "high"|"medium"|"low", "section": section name, "issue": "...", "fix": concrete action}}] (3-6, most important first),
"journey": {{
  "summary": 2-3 sentences on how the paper relates to the project's history,
  "differentiation": {{"status": "clear"|"partial"|"unclear", "comment": how it positions itself against the closest papers}},
  "gaps": [{{"id": "G1", "status": "addressed"|"partial"|"not_addressed", "evidence": short quote}}] (every gap),
  "research_questions": [{{"id": "RQ1", "status": "answered"|"partial"|"not_answered", "evidence": short quote}}] (every RQ),
  "plan": [{{"id": plan item id, "status": "done"|"changed"|"not_done", "effect": "stronger"|"similar"|"weaker"|null, "evidence": short quote, "comment": one sentence}}] (every plan item)
}}
Plan rules: "done" = run/used and reported; "changed" = something different was done instead (set effect by comparing rigour);
"not_done" = absent, only mentioned, or left for future work (effect null)."""
    data = llm_service.complete_json(REVIEWER_SYSTEM, prompt, 4000)
    if not isinstance(data.get("review"), dict) or not isinstance(data.get("journey"), dict):
        raise llm_service.LLMUnavailable("LLM evaluation missing review or journey")
    return data


def _fallback_judge(history: dict, sections: list[dict], body: str, checks: dict, refs: dict, repro: list[dict]) -> dict:
    """Without an LLM: review scores estimated from the deterministic checks, journey by keyword matching."""
    present = {s["key"] for s in sections}
    repro_share = sum(r["ok"] for r in repro) / len(repro)
    cited = refs["related_coverage"][:5]
    cited_share = sum(c["cited"] for c in cited) / len(cited) if cited else 0
    visuals = min(1, (checks["figures"] + checks["tables"]) / 3)
    note = "Estimated from the paper's structure (LLM unavailable)."
    review = {
        "contribution": {"score": round(4 + 3 * ("related" in present) + 3 * cited_share, 1), "comment": note},
        "methodology": {"score": round(min(10, 3 + 2 * ("method" in present) + 2 * ("experiments" in present) + 3 * repro_share), 1), "comment": note},
        "results": {"score": round(2 + 3 * ("results" in present) + 2 * visuals + 3 * repro[-1]["ok"], 1), "comment": note},
        "clarity": {"score": round(10 * (1 - len(checks["missing_sections"]) / len(REQUIRED)), 1), "comment": note},
    }
    words = _tokens(body)

    def coverage(text: str) -> float:
        terms = _tokens(text)
        return len(terms & words) / len(terms) if terms else 0.0

    level = lambda c, hi, mid, lo: hi if c >= 0.6 else mid if c >= 0.35 else lo  # noqa: E731
    return {
        "review": review, "summary": "Evaluated without the LLM; the scores are estimates from the structure of the paper.",
        "strengths": [], "fixes": [],
        "journey": {
            "summary": "Matched with keywords because the LLM is unavailable; check the statuses yourself.",
            "differentiation": {"status": "clear" if cited_share >= 0.6 else "partial" if cited_share else "unclear",
                                "comment": f"{round(cited_share * 100)}% of the closest papers are cited."},
            "gaps": [{"id": g["id"], "status": level(coverage(g["title"] + " " + g["description"]), "addressed", "partial", "not_addressed"), "evidence": ""} for g in history["gaps"]],
            "research_questions": [{"id": q["id"], "status": level(coverage(q["question"]), "answered", "partial", "not_answered"), "evidence": ""} for q in history["rqs"]],
            "plan": [{"id": i["id"], "status": "done" if coverage(i["label"][:200]) >= 0.6 else "not_done", "effect": None, "evidence": "",
                      "comment": f"{round(coverage(i['label'][:200]) * 100)}% of its key terms appear in the paper."} for i in history["plan"]],
        },
    }


# ------------------------------------------------------------------ assembling the result
def _pick(value, allowed, default):
    return value if value in allowed else default


def _merge(rows: list[dict], judged: list, allowed: tuple, default: str, extra=()) -> list[dict]:
    by_id = {j.get("id"): j for j in judged or [] if isinstance(j, dict)}
    out = []
    for r in rows:
        j = by_id.get(r["id"], {})
        row = {**r, "status": _pick(j.get("status"), allowed, default), "evidence": str(j.get("evidence") or "")[:400]}
        for key in extra:
            row[key] = j.get(key)
        out.append(row)
    return out


def _score(review: dict, checks: dict, refs: dict, repro: list[dict]) -> dict:
    structure = max(0.0, 1 - len(checks["missing_sections"]) / len(REQUIRED)
                    - (0.1 if not (100 <= checks["abstract_words"] <= 350) else 0)
                    - (0.1 if not checks["abstract_has_numbers"] else 0))
    cited = refs["related_coverage"][:5]
    cited_share = sum(c["cited"] for c in cited) / len(cited) if cited else 0
    ref_ok = max(0.0, min(1.0, refs["count"] / 10) - (0.3 if refs["missing"] else 0))
    parts = []
    for key, name, weight in CRITERIA:
        item = review.get(key) if isinstance(review.get(key), dict) else {}
        try:
            value = max(0.0, min(10.0, float(item.get("score", 0)))) / 10
        except (TypeError, ValueError):
            value = 0.0
        if key == "clarity":  # half judged, half measured
            value = 0.5 * value + 0.5 * structure
        parts.append({"key": key, "name": name, "score": round(value * weight, 1), "max": weight, "comment": str(item.get("comment") or "")})
    parts.append({"key": "references", "name": "References & related work", "max": 10,
                  "score": round(10 * (0.5 * ref_ok + 0.5 * cited_share), 1),
                  "comment": f"{refs['count']} references; {sum(c['cited'] for c in cited)} of the {len(cited)} closest papers cited."})
    parts.append({"key": "reproducibility", "name": "Reproducibility", "max": 15,
                  "score": round(15 * sum(r["ok"] for r in repro) / len(repro), 1),
                  "comment": f"{sum(r['ok'] for r in repro)} of {len(repro)} checklist items found."})
    total = round(sum(p["score"] for p in parts), 1)
    band = "Ready for review" if total >= 75 else "Needs revision" if total >= 55 else "Major revision"
    return {"total": total, "band": band, "parts": parts}


def _rule_fixes(checks: dict, refs: dict, repro: list[dict]) -> list[dict]:
    fixes = []
    for k in checks["missing_sections"]:
        fixes.append({"priority": "high" if k in ("results", "method", "experiments") else "medium", "section": SECTION_NAMES[k],
                      "issue": f"No {SECTION_NAMES[k].lower()} section was found", "fix": f"Add a clearly titled {SECTION_NAMES[k]} section."})
    if refs["missing"]:
        fixes.append({"priority": "high", "section": "References", "issue": f"Citations without a reference entry: {', '.join(refs['missing'][:6])}",
                      "fix": "Add the missing entries to the reference list or correct the citation numbers."})
    if checks["unsupported_claim_count"]:
        fixes.append({"priority": "medium", "section": "Results", "issue": f"{checks['unsupported_claim_count']} strong claims have no number or citation",
                      "fix": "Back every claim such as 'significantly better' with a result, a statistical test or a citation."})
    missing_repro = [r["label"].lower() for r in repro if not r["ok"]]
    if missing_repro:
        fixes.append({"priority": "low", "section": "Experiments", "issue": "Reproducibility details missing: " + "; ".join(missing_repro),
                      "fix": "Add these details so others can repeat the experiments."})
    return fixes


def evaluate(project: dict, filename: str, data: bytes, note: str) -> dict:
    text, pages = extract_text(filename, data)
    sections = split_sections(text)
    body = "\n".join(s["text"] for s in sections if s["key"] != "references")
    checks = quality_checks(sections, body)
    refs = analyse_references(sections, body, project["literature"]["papers"])
    repro = reproducibility(body)
    history = {"gaps": research_gaps(project), "rqs": research_questions(project), "plan": plan_items(project.get("plan"))}

    method, llm_note = "llm", None
    try:
        judged = _llm_judge(project, history, sections, note)
    except llm_service.LLMUnavailable as e:
        judged = _fallback_judge(history, sections, body, checks, refs, repro)
        method, llm_note = "heuristic", str(e)

    j = judged["journey"]
    diff = j.get("differentiation") if isinstance(j.get("differentiation"), dict) else {}
    plan_rows = _merge(history["plan"], j.get("plan"), ("done", "changed", "not_done"), "not_done", extra=("effect", "comment"))
    for r in plan_rows:
        r["effect"] = _pick(r["effect"], ("stronger", "similar", "weaker"), None) if r["status"] == "changed" else None
        r["comment"] = str(r["comment"] or "")[:400]
    journey = {
        "summary": str(j.get("summary") or ""),
        "differentiation": {"status": _pick(diff.get("status"), ("clear", "partial", "unclear"), "unclear"), "comment": str(diff.get("comment") or "")},
        "gaps": _merge(history["gaps"], j.get("gaps"), ("addressed", "partial", "not_addressed"), "not_addressed"),
        "research_questions": _merge(history["rqs"], j.get("research_questions"), ("answered", "partial", "not_answered"), "not_answered"),
        "plan": plan_rows,
        "has_plan": bool(history["plan"]),
    }

    order = {"high": 0, "medium": 1, "low": 2}
    llm_fixes = [{"priority": _pick(f.get("priority"), tuple(order), "medium"), "section": str(f.get("section") or ""),
                  "issue": str(f.get("issue") or ""), "fix": str(f.get("fix") or "")}
                 for f in judged.get("fixes") or [] if isinstance(f, dict) and f.get("issue")]
    fixes = sorted(llm_fixes + _rule_fixes(checks, refs, repro), key=lambda f: order[f["priority"]])[:10]

    return {
        "file": {"name": filename[:200], "size": len(data), "pages": pages, "words": checks["words"]},
        "change_note": note,
        "score": _score(judged["review"], checks, refs, repro),
        "summary": str(judged.get("summary") or ""),
        "strengths": [str(s) for s in judged.get("strengths") or []][:4],
        "fixes": fixes,
        "journey": journey,
        "outline": [{"key": s["key"], "title": SECTION_NAMES.get(s["key"], s["title"]), "words": _words(s["text"])} for s in sections],
        "checks": checks,
        "references": refs,
        "reproducibility": repro,
        "method": method,
        "note": llm_note,
        "evaluated_at": _now(),
    }


def journey_counts(journey: dict) -> dict:
    count = lambda rows, full, half=None: sum(1 if r["status"] == full else 0.5 if r["status"] == half else 0 for r in rows)  # noqa: E731
    return {"gaps": [count(journey["gaps"], "addressed", "partial"), len(journey["gaps"])],
            "questions": [count(journey["research_questions"], "answered", "partial"), len(journey["research_questions"])],
            "plan": [count(journey["plan"], "done"), len(journey["plan"])],
            "changed": sum(r["status"] == "changed" for r in journey["plan"])}


def draft_summary(paper: dict, draft: int) -> dict | None:
    """Compact record of a previous draft, kept so revisions can be compared."""
    if "score" not in paper:  # evaluated by an earlier version of this stage
        return None
    return {"draft": draft, "file": paper["file"]["name"], "evaluated_at": paper["evaluated_at"],
            "score": paper["score"]["total"], "band": paper["score"]["band"],
            "parts": {p["key"]: p["score"] for p in paper["score"]["parts"]}, "journey": journey_counts(paper["journey"])}
