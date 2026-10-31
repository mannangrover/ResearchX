"""Stage 8 — Paper evaluation.

The student implements the stage 7 plan, writes the paper, and uploads it
(PDF, Word, LaTeX, Markdown or text). ResearchX does not write the paper; it
checks it:

  * Plan compliance (mandatory): every hypothesis, experiment, dataset,
    baseline, metric and ablation of the stage 7 plan is classified as
    followed / improved (a justified, at-least-as-rigorous change) /
    changed (unjustified deviation) / missing.
  * Research questions answered, hypotheses supported / refuted.
  * Structure, claims and statistics, reproducibility checklist.
  * References: citation consistency and coverage of the closest related work.

Text checks are deterministic; the plan / RQ judgement uses the LLM with a
keyword-matching fallback. Only the evaluation is stored, not the paper text.
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

STATUS_WEIGHT = {"followed": 1.0, "improved": 1.0, "changed": 0.4, "missing": 0.0}
VERDICTS = {
    "follows": "Follows the plan",
    "justify": "Deviations need justification",
    "not_following": "Does not follow the plan",
}

EVALUATOR_SYSTEM = (
    "You are ResearchX's paper evaluator. You check a student's paper against the experiment plan they "
    "committed to. Be strict and evidence-based: quote or point to the paper for every judgement. "
    "A change from the plan counts as 'improved' ONLY if the paper or the student's note justifies it and the "
    "new choice is at least as rigorous (e.g. a stronger baseline, a larger or more standard dataset, an extra metric). "
    "Changes that weaken the evaluation, or are not explained, are 'changed'. Respond with JSON only."
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


# ------------------------------------------------------------------ plan items
def plan_items(plan: dict) -> list[dict]:
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


def _paper_excerpt(sections: list[dict], limit: int = 20000) -> str:
    budget = {"abstract": 2000, "front": 1500, "introduction": 2500, "method": 4000, "experiments": 4500,
              "results": 4500, "discussion": 2000, "conclusion": 1800}
    parts = [f"## {SECTION_NAMES.get(s['key'], s['title'])}\n{s['text'][:budget[s['key']]]}" for s in sections if s["key"] in budget]
    return "\n\n".join(parts)[:limit]


def _llm_judge(project: dict, items: list[dict], rqs: list[dict], sections: list[dict], note: str) -> dict:
    plan = project["plan"]
    listing = "\n".join(f"{i['id']} [{i['kind']}]: {i['label'][:300]}" for i in items)
    rq_list = "\n".join(f"{q['id']}: {q['question']}" for q in rqs)
    prompt = f"""EXPERIMENT PLAN the student committed to (objective: {plan['objective']}):
{listing}

RESEARCH QUESTIONS:
{rq_list or '(none)'}

STUDENT'S NOTE ON CHANGES FROM THE PLAN: {note or '(none given)'}

PAPER (excerpts by section):
{_paper_excerpt(sections)}

Evaluate the paper. Rules: a Hypothesis or Experiment is 'followed' only if the paper actually RUNS it and REPORTS
its results; merely stating or describing it (or deferring it to future work) is 'missing'. A dataset, baseline or
metric is 'followed' only if it is used in the reported results.
Return JSON:
"items": [{{"id": plan item id, "status": "followed"|"improved"|"changed"|"missing", "evidence": short quote or section reference, "comment": one sentence}}] — one entry for EVERY plan item,
"hypotheses": [{{"id": "H1", "outcome": "supported"|"refuted"|"inconclusive"|"not_reported", "evidence": short quote}}],
"research_questions": [{{"id": "RQ1", "status": "answered"|"partial"|"missing", "evidence": short quote}}],
"summary": 3-4 sentences on how well the paper delivers the plan and its overall quality,
"strengths": [2-4 short strengths],
"fixes": [{{"priority": "high"|"medium"|"low", "section": section name, "issue": "...", "fix": concrete action}}] (3-8, most important first)"""
    data = llm_service.complete_json(EVALUATOR_SYSTEM, prompt, 3500)
    if not isinstance(data.get("items"), list):
        raise llm_service.LLMUnavailable("LLM evaluation missing plan items")
    return data


def _keyword_judge(items: list[dict], rqs: list[dict], sections: list[dict], body: str) -> dict:
    """Fallback without an LLM: an item counts as followed when most of its key terms appear in the paper."""
    words = _tokens(body)
    results_text = _section(sections, "results", "discussion", "conclusion").lower()

    def coverage(text: str) -> float:
        terms = _tokens(text)
        return len(terms & words) / len(terms) if terms else 0.0

    judged = []
    for it in items:
        c = coverage(it["label"][:200])
        judged.append({"id": it["id"], "status": "followed" if c >= 0.6 else "missing",
                       "evidence": "", "comment": f"{round(c * 100)}% of its key terms appear in the paper (keyword check)."})
    hyps = [{"id": it["id"], "outcome": "inconclusive" if coverage(it["label"]) >= 0.5 and results_text else "not_reported", "evidence": ""}
            for it in items if it["kind"] == "Hypothesis"]
    rq = [{"id": q["id"], "status": "answered" if coverage(q["question"]) >= 0.6 else "partial" if coverage(q["question"]) >= 0.35 else "missing", "evidence": ""}
          for q in rqs]
    return {"items": judged, "hypotheses": hyps, "research_questions": rq,
            "summary": "Evaluated with keyword matching because the LLM is unavailable; review the statuses manually.",
            "strengths": [], "fixes": []}


# ------------------------------------------------------------------ scoring
def _compliance(items: list[dict], judged: dict) -> dict:
    by_id = {j.get("id"): j for j in judged.get("items", []) if isinstance(j, dict)}
    rows = []
    for it in items:
        j = by_id.get(it["id"], {})
        status = j.get("status") if j.get("status") in STATUS_WEIGHT else "missing"
        rows.append({**it, "status": status, "evidence": str(j.get("evidence") or "")[:400], "comment": str(j.get("comment") or "")[:400]})
    counts = {s: sum(r["status"] == s for r in rows) for s in STATUS_WEIGHT}
    coverage = sum(STATUS_WEIGHT[r["status"]] for r in rows) / len(rows) if rows else 0.0
    core = [r for r in rows if r["kind"] in ("Hypothesis", "Experiment")]
    if any(r["status"] == "missing" for r in core) or coverage < 0.5:
        verdict = "not_following"
    elif counts["changed"] or counts["missing"] or coverage < 0.8:
        verdict = "justify"
    else:
        verdict = "follows"
    return {"items": rows, "counts": counts, "coverage": round(coverage, 3), "verdict": verdict, "verdict_label": VERDICTS[verdict]}


def _readiness(compliance: dict, hyps: list[dict], rqs: list[dict], checks: dict, refs: dict, repro: list[dict]) -> dict:
    rq_score = sum({"answered": 1, "partial": 0.5}.get(q["status"], 0) for q in rqs) / len(rqs) if rqs else 1.0
    hyp_score = sum(h["outcome"] != "not_reported" for h in hyps) / len(hyps) if hyps else 1.0
    structure = 1 - len(checks["missing_sections"]) / len(REQUIRED)
    structure -= 0.1 if not (100 <= checks["abstract_words"] <= 350) else 0
    structure -= 0.1 if not checks["abstract_has_numbers"] else 0
    cited_related = sum(c["cited"] for c in refs["related_coverage"][:5]) / max(1, min(5, len(refs["related_coverage"])))
    ref_ok = 1.0 if refs["count"] >= 10 else refs["count"] / 10
    ref_ok -= 0.3 if refs["missing"] else 0
    parts = [
        ("compliance", "Plan compliance", compliance["coverage"], 35),
        ("questions", "Research questions answered", rq_score, 15),
        ("hypotheses", "Hypotheses reported", hyp_score, 10),
        ("structure", "Structure & abstract", max(0.0, structure), 15),
        ("references", "References & related work", max(0.0, 0.5 * ref_ok + 0.5 * cited_related), 10),
        ("reproducibility", "Reproducibility", sum(r["ok"] for r in repro) / len(repro), 15),
    ]
    rows = [{"key": k, "name": n, "score": round(v * w, 1), "max": w} for k, n, v, w in parts]
    total = round(sum(r["score"] for r in rows), 1)
    capped = compliance["verdict"] == "not_following" and total > 49
    if capped:
        total = 49.0
    band = "Ready for review" if total >= 75 else "Needs revision" if total >= 50 else "Major gaps"
    return {"total": total, "band": band, "parts": rows, "capped_by_plan": capped}


def _rule_fixes(compliance: dict, checks: dict, refs: dict, repro: list[dict]) -> list[dict]:
    fixes = []
    for r in compliance["items"]:
        if r["status"] == "missing" and r["kind"] in ("Hypothesis", "Experiment"):
            fixes.append({"priority": "high", "section": "Experiments", "issue": f"{r['id']} from the plan is not in the paper",
                          "fix": f"Run and report {r['id']} ({r['label'][:90]}), or explain in the change note why a better alternative replaced it."})
        elif r["status"] == "changed":
            fixes.append({"priority": "high", "section": "Method", "issue": f"{r['id']} ({r['kind'].lower()}) deviates from the plan without justification",
                          "fix": "Justify the change in the paper and the change note, showing it is at least as rigorous, or follow the plan."})
    for k in checks["missing_sections"]:
        fixes.append({"priority": "high" if k in ("results", "method", "experiments") else "medium", "section": SECTION_NAMES[k],
                      "issue": f"No {SECTION_NAMES[k].lower()} section was found", "fix": f"Add a clearly titled {SECTION_NAMES[k]} section."})
    if refs["missing"]:
        fixes.append({"priority": "high", "section": "References", "issue": f"Citations without a reference entry: {', '.join(refs['missing'][:6])}",
                      "fix": "Add the missing entries to the reference list or correct the citation numbers."})
    uncited_close = [c["title"] for c in refs["related_coverage"][:3] if not c["cited"]]
    if uncited_close:
        fixes.append({"priority": "medium", "section": "Related work", "issue": "Closest related work is not cited: " + "; ".join(t[:60] for t in uncited_close),
                      "fix": "Cite and discuss these papers, and compare against them where possible."})
    if checks["unsupported_claim_count"]:
        fixes.append({"priority": "medium", "section": "Results", "issue": f"{checks['unsupported_claim_count']} strong claims have no number or citation",
                      "fix": "Back every claim such as 'significantly better' with a result, a statistical test or a citation."})
    for r in repro:
        if not r["ok"]:
            fixes.append({"priority": "low", "section": "Experiments", "issue": f"Reproducibility: {r['label'].lower()} — not found", "fix": "Add this detail."})
    return fixes


def evaluate(project: dict, filename: str, data: bytes, note: str) -> dict:
    text, pages = extract_text(filename, data)
    sections = split_sections(text)
    body = "\n".join(s["text"] for s in sections if s["key"] != "references")
    checks = quality_checks(sections, body)
    refs = analyse_references(sections, body, project["literature"]["papers"])
    repro = reproducibility(body)
    items = plan_items(project["plan"])
    rqs = research_questions(project)

    method, llm_note = "llm", None
    try:
        judged = _llm_judge(project, items, rqs, sections, note)
    except llm_service.LLMUnavailable as e:
        judged = _keyword_judge(items, rqs, sections, body)
        method, llm_note = "heuristic", str(e)

    statements = {h["id"]: h["statement"] for h in project["plan"]["hypotheses"]}
    outcomes = {h.get("id"): h for h in judged.get("hypotheses", []) if isinstance(h, dict)}
    hyps = [{"id": hid, "statement": st,
             "outcome": outcomes.get(hid, {}).get("outcome") if outcomes.get(hid, {}).get("outcome") in ("supported", "refuted", "inconclusive", "not_reported") else "not_reported",
             "evidence": str(outcomes.get(hid, {}).get("evidence") or "")[:400]} for hid, st in statements.items()]
    # A hypothesis whose outcome is not reported was not tested, whatever the item judgement said
    untested = {h["id"] for h in hyps if h["outcome"] == "not_reported"}
    for j in judged.get("items", []):
        if isinstance(j, dict) and j.get("id") in untested and j.get("status") != "missing":
            j["status"] = "missing"
            j["comment"] = "Stated but no result is reported for it. " + str(j.get("comment") or "")
    compliance = _compliance(items, judged)
    rq_judged = {q.get("id"): q for q in judged.get("research_questions", []) if isinstance(q, dict)}
    rq_rows = [{**q, "status": rq_judged.get(q["id"], {}).get("status") if rq_judged.get(q["id"], {}).get("status") in ("answered", "partial", "missing") else "missing",
                "evidence": str(rq_judged.get(q["id"], {}).get("evidence") or "")[:400]} for q in rqs]

    llm_fixes = [{"priority": f.get("priority") if f.get("priority") in ("high", "medium", "low") else "medium",
                  "section": str(f.get("section") or ""), "issue": str(f.get("issue") or ""), "fix": str(f.get("fix") or "")}
                 for f in judged.get("fixes", []) if isinstance(f, dict) and f.get("issue")]
    order = {"high": 0, "medium": 1, "low": 2}
    fixes = sorted(_rule_fixes(compliance, checks, refs, repro) + llm_fixes, key=lambda f: order[f["priority"]])[:14]

    return {
        "file": {"name": filename[:200], "size": len(data), "pages": pages, "words": checks["words"]},
        "change_note": note,
        "outline": [{"key": s["key"], "title": SECTION_NAMES.get(s["key"], s["title"]), "words": _words(s["text"])} for s in sections],
        "checks": checks,
        "references": refs,
        "reproducibility": repro,
        "compliance": compliance,
        "hypotheses": hyps,
        "research_questions": rq_rows,
        "summary": str(judged.get("summary") or ""),
        "strengths": [str(s) for s in judged.get("strengths") or []][:4],
        "fixes": fixes,
        "readiness": _readiness(compliance, hyps, rq_rows, checks, refs, repro),
        "method": method,
        "note": llm_note,
        "evaluated_at": _now(),
    }


def draft_summary(paper: dict, draft: int) -> dict:
    """Compact record of a previous draft, kept so revisions can be compared."""
    return {"draft": draft, "file": paper["file"]["name"], "evaluated_at": paper["evaluated_at"],
            "readiness": paper["readiness"]["total"], "band": paper["readiness"]["band"],
            "coverage": paper["compliance"]["coverage"], "verdict": paper["compliance"]["verdict_label"],
            "parts": {p["key"]: p["score"] for p in paper["readiness"]["parts"]}}
