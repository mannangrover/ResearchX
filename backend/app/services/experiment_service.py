"""Stage 7 — Experiment planning.

Turns the scored (and ideally refined) project into an experiment and
methodology plan: hypotheses traced to research questions, datasets,
baselines taken from the related-work set, metrics, experiments, ablations,
a week-by-week timeline that fits the student's time budget, resources and
risks. The LLM drafts the plan from the stored evidence; a template plan is
used when the LLM is unavailable.

Stored shape (projects.plan): see `_normalise` for the keys.
"""
import re
from datetime import datetime, timezone

from . import llm_service
from .llm_scoring_service import build_evidence

PLANNER_SYSTEM = (
    "You are ResearchX's experiment-design advisor for student research teams. "
    "Design rigorous but realistic experiments. Use ONLY datasets and baselines that are "
    "well known and publicly available, or that appear in the evidence; never invent dataset names. "
    "Prefer baselines from the related papers provided. Respond with JSON only."
)

COMPUTE = {
    "cpu": "a laptop CPU only",
    "single_gpu": "one consumer GPU (e.g. Colab / a 12-24 GB card)",
    "multi_gpu": "several GPUs or a university cluster",
}

# Fraction of the time budget for each phase of the template plan
PHASES = [
    ("Setup & data preparation", 0.15, ["Obtain datasets and check licences", "Build the data pipeline and splits", "Set up experiment tracking"], "Clean, versioned dataset splits"),
    ("Reproduce baselines", 0.20, ["Run the selected baselines", "Match their reported numbers within a tolerance"], "Baseline results table"),
    ("Implement the proposed method", 0.25, ["Implement the core method", "Unit-test key components", "Small-scale sanity runs"], "Working implementation"),
    ("Main experiments & ablations", 0.25, ["Run the main comparison with multiple seeds", "Run the ablation study", "Robustness / efficiency runs"], "Complete results with confidence intervals"),
    ("Analysis & write-up", 0.15, ["Statistical tests and error analysis", "Figures and tables", "Draft the results section"], "Results section draft"),
]

METRIC_HINTS = [
    (r"classif|detect|recogni|diagnos|sentiment|fraud|spam", [
        ("Macro F1", "Balanced performance across classes"), ("Accuracy", "Overall correctness"),
        ("AUROC", "Ranking quality independent of threshold")]),
    (r"retriev|search|recommend|rank", [
        ("Recall@k", "Share of relevant items in the top k"), ("MRR", "How high the first relevant item ranks"),
        ("nDCG@k", "Graded ranking quality")]),
    (r"generat|summar|translat|caption|dialog|chat|llm|language model", [
        ("ROUGE-L / BLEU", "Overlap with reference outputs"), ("Human or LLM-judge rating", "Quality where references are weak"),
        ("Factual consistency", "Share of outputs without unsupported claims")]),
    (r"segment|vision|image|video", [
        ("mIoU", "Segmentation overlap"), ("mAP", "Detection precision across recall levels")]),
    (r"forecast|predict|regress|time series", [
        ("MAE / RMSE", "Prediction error"), ("MAPE", "Relative error")]),
    (r"code|program|software|bug|test", [
        ("pass@k", "Share of tasks solved within k attempts"), ("Precision / recall of findings", "Correct vs missed detections")]),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def active_proposal(project: dict) -> tuple[dict | None, str]:
    """The proposal the plan should follow, and a label describing where it came from."""
    state = project.get("refinement") or {}
    if state.get("approved") and state.get("proposal"):
        return state["proposal"], "approved refined proposal"
    history = project.get("history") or []
    if history and history[-1].get("proposal"):
        return history[-1]["proposal"], f"refined proposal applied in version {len(history) + 1}"
    return None, "original project idea (no refined proposal yet)"


def _context(project: dict, proposal: dict | None, options: dict) -> str:
    score = project["score"]
    gaps = "\n".join(f"- {g['title']}: {g['description']}" for g in score.get("gaps", []))
    rqs = (proposal or {}).get("research_questions") or score.get("research_questions", [])
    parts = [
        build_evidence(project),
        f"RESEARCH OPPORTUNITY SCORE: {score['total']}/100 ({score['band']})",
        f"RESEARCH GAPS:\n{gaps or '- none'}",
        "RESEARCH QUESTIONS:\n" + "\n".join(f"RQ{i}: {q}" for i, q in enumerate(rqs, 1)),
    ]
    if proposal:
        parts.append(
            "REFINED PROPOSAL:\n"
            f"Problem: {proposal.get('problem_statement', '')}\nApproach: {proposal.get('approach', '')}\n"
            f"Differentiation: {proposal.get('differentiation', '')}\n"
            f"Constraints: {'; '.join(proposal.get('constraints', []))}\n"
            f"Out of scope: {'; '.join(proposal.get('out_of_scope', []))}"
        )
    parts.append(
        f"TEAM CONSTRAINTS: {options['weeks']} weeks, team of {options['team_size']}, compute: {COMPUTE[options['compute']]}."
        + (f" Notes from the student: {options['notes']}" if options.get("notes") else "")
    )
    return "\n\n".join(parts)


# ------------------------------------------------------------------ normalisation
def _s(v) -> str:
    return str(v or "").strip()


def _list(v) -> list[str]:
    if isinstance(v, str):
        v = [x.strip("-• ").strip() for x in v.splitlines()]
    return [_s(x) for x in (v or []) if _s(x)]


def _ids(v) -> list[str]:
    return [x.upper() for x in re.findall(r"[A-Za-z]+\d+", " ".join(_list(v) if not isinstance(v, str) else [v]))]


def _timeline(phases: list[dict], weeks: int) -> list[dict]:
    """Scale phase durations to the time budget and give each a start/end week."""
    raw = [max(float(p.get("weeks") or 1), 0.5) for p in phases]
    scale = weeks / sum(raw) if raw else 1
    out, start = [], 1
    for i, (p, w) in enumerate(zip(phases, raw)):
        length = max(1, round(w * scale))
        end = weeks if i == len(phases) - 1 else min(weeks, start + length - 1)
        out.append({"phase": _s(p.get("phase")), "start_week": start, "end_week": max(start, end),
                    "tasks": _list(p.get("tasks")), "deliverable": _s(p.get("deliverable"))})
        start = min(weeks, end + 1)
    return out


def _normalise(raw: dict, options: dict) -> dict:
    hyps = [{"id": f"H{i}", "statement": _s(h.get("statement") if isinstance(h, dict) else h),
             "research_question": _s(h.get("research_question")) if isinstance(h, dict) else ""}
            for i, h in enumerate(raw.get("hypotheses") or [], 1)]
    exps = [{"id": f"E{i}", "title": _s(e.get("title")), "purpose": _s(e.get("purpose")),
             "setup": _s(e.get("setup")), "tests": _ids(e.get("tests")), "metrics": _list(e.get("metrics")),
             "expected_outcome": _s(e.get("expected_outcome"))}
            for i, e in enumerate(raw.get("experiments") or [], 1) if isinstance(e, dict)]

    def items(key, fields):
        return [{f: _s(x.get(f)) for f in fields} for x in raw.get(key) or [] if isinstance(x, dict)]

    resources = raw.get("resources") if isinstance(raw.get("resources"), dict) else {}
    return {
        "objective": _s(raw.get("objective")),
        "hypotheses": [h for h in hyps if h["statement"]],
        "datasets": items("datasets", ("name", "description", "source", "why")),
        "baselines": items("baselines", ("name", "source", "why")),
        "metrics": items("metrics", ("name", "description", "target")),
        "experiments": [e for e in exps if e["title"]],
        "ablations": _list(raw.get("ablations")),
        "methodology": _list(raw.get("methodology")),
        "timeline": _timeline([p for p in raw.get("timeline") or [] if isinstance(p, dict)], options["weeks"]),
        "resources": {"compute": _s(resources.get("compute")) or COMPUTE[options["compute"]],
                      "tools": _list(resources.get("tools")), "estimate": _s(resources.get("estimate"))},
        "risks": items("risks", ("risk", "mitigation")),
    }


# ------------------------------------------------------------------ LLM plan
def _llm_plan(project: dict, proposal: dict | None, options: dict) -> dict:
    prompt = f"""{_context(project, proposal, options)}

Design the EXPERIMENT AND METHODOLOGY PLAN for this project. It must fit the team constraints.
Return JSON with exactly these keys:
"objective": one sentence,
"hypotheses": [{{"statement": testable hypothesis, "research_question": "RQ1"}}] (one per research question, 2-4),
"datasets": [{{"name", "description", "source": URL or paper it comes from, "why"}}] (1-3 public datasets),
"baselines": [{{"name", "source": related paper title, "why"}}] (2-4, prefer the closest papers above),
"metrics": [{{"name", "description", "target": what result would support the hypothesis}}] (3-5),
"experiments": [{{"title", "purpose", "setup": concrete procedure, "tests": ["H1"], "metrics": [metric names], "expected_outcome"}}] (3-5, include the main comparison and a robustness or efficiency study),
"ablations": [component removed or varied, and what it shows] (2-4),
"methodology": [rules for validity: splits, seeds, statistical test, threats to validity] (4-6),
"timeline": [{{"phase", "weeks": number, "tasks": [..], "deliverable"}}] (4-6 phases summing to {options['weeks']} weeks),
"resources": {{"compute", "tools": [libraries/frameworks], "estimate": rough compute time}},
"risks": [{{"risk", "mitigation"}}] (3-5)"""
    data = llm_service.complete_json(PLANNER_SYSTEM, prompt, 3500)
    plan = _normalise(data, options)
    if not plan["hypotheses"] or not plan["experiments"] or not plan["timeline"]:
        raise llm_service.LLMUnavailable("LLM plan was missing hypotheses, experiments or timeline")
    return plan


# ------------------------------------------------------------------ template plan
def _heuristic_plan(project: dict, proposal: dict | None, options: dict) -> dict:
    score = project["score"]
    prof = project["profile"]["profile"]
    papers = project["literature"]["papers"]
    rqs = (proposal or {}).get("research_questions") or score.get("research_questions", [])
    text = " ".join([project["title"], project["idea_text"], prof.get("summary", ""), " ".join(prof.get("techniques", []))]).lower()

    metrics = next((m for pattern, m in METRIC_HINTS if re.search(pattern, text)), [("Task accuracy", "Primary task performance")])
    metric_rows = [{"name": n, "description": d, "target": "Better than the strongest baseline across seeds"} for n, d in metrics]
    metric_rows.append({"name": "Runtime / cost", "description": "Wall-clock time and memory per run",
                        "target": f"Fits the {COMPUTE[options['compute']]} budget"})
    main = [m["name"] for m in metric_rows[:2]]

    baselines = [{"name": p["title"][:90], "source": f"{p['title']} ({p.get('year') or 'n.d.'})",
                  "why": f"Closest related work (similarity {p['similarity']:.2f})"} for p in papers[:3]]
    hyps = [{"statement": f"The proposed approach answers “{q}” with a measurable improvement over the baselines.",
             "research_question": f"RQ{i}"} for i, q in enumerate(rqs[:4], 1)]
    h_ids = [f"H{i}" for i in range(1, len(hyps) + 1)] or ["H1"]

    return _normalise({
        "objective": (proposal or {}).get("problem_statement") or prof.get("problem") or project["idea_text"][:300],
        "hypotheses": hyps or [{"statement": f"{project['title']} outperforms the closest related work on its main task.",
                                "research_question": "RQ1"}],
        "datasets": [{"name": "Public benchmark used by the closest paper",
                      "description": "Use the dataset reported in the closest related paper so results are directly comparable.",
                      "source": papers[0]["title"] if papers else "", "why": "Comparability with published numbers"}],
        "baselines": baselines,
        "metrics": metric_rows,
        "experiments": [
            {"title": "Main comparison against baselines", "purpose": "Test the core claim",
             "setup": "Train/evaluate every method on the same splits with 3-5 random seeds; report mean ± std.",
             "tests": h_ids, "metrics": main, "expected_outcome": "The proposed method beats the strongest baseline."},
            {"title": "Ablation study", "purpose": "Show which component causes the improvement",
             "setup": "Remove or replace one component at a time and re-run the main comparison.",
             "tests": h_ids[:1], "metrics": main[:1], "expected_outcome": "Each core component contributes measurably."},
            {"title": "Robustness / generalisation", "purpose": "Check results hold beyond one setting",
             "setup": "Evaluate on a second dataset, a shifted split, or noisy inputs.",
             "tests": h_ids[-1:], "metrics": main[:1], "expected_outcome": "Performance degrades less than the baselines."},
            {"title": "Efficiency", "purpose": "Show the method is practical",
             "setup": "Measure training/inference time and memory on the same hardware for all methods.",
             "tests": [], "metrics": ["Runtime / cost"], "expected_outcome": "Comparable or lower cost than the baselines."},
        ],
        "ablations": [f"Remove {t}" for t in prof.get("techniques", [])[:3]] or ["Remove the main proposed component"],
        "methodology": [
            "Fix train / validation / test splits before any tuning; never tune on the test set.",
            "Run every configuration with 3-5 seeds and report mean ± standard deviation.",
            "Use a paired statistical test (e.g. Wilcoxon or paired t-test, p < 0.05) for the main claim.",
            "Give every baseline the same tuning budget as the proposed method.",
            "Threats to validity: dataset bias, metric limitations, and limited compute — state them explicitly.",
        ],
        "timeline": [{"phase": n, "weeks": f * options["weeks"], "tasks": t, "deliverable": d} for n, f, t, d in PHASES],
        "resources": {"compute": COMPUTE[options["compute"]], "tools": ["Python", "Git", "Experiment tracking (e.g. MLflow or W&B)"],
                      "estimate": "Depends on dataset size; keep each run short enough to repeat with several seeds."},
        "risks": [
            {"risk": "Baselines cannot be reproduced", "mitigation": "Use official code or report your re-run numbers transparently."},
            {"risk": "Dataset access or licence problems", "mitigation": "Confirm access in week 1 and keep a public fallback dataset."},
            {"risk": "Compute budget runs out", "mitigation": "Prototype on a subset and scale only the final runs."},
            {"risk": "No improvement over baselines", "mitigation": "A careful negative result with ablations is still a contribution."},
        ],
    }, options)


def build_plan(project: dict, options: dict) -> dict:
    proposal, based_on = active_proposal(project)
    method, note = "llm", None
    try:
        plan = _llm_plan(project, proposal, options)
    except llm_service.LLMUnavailable as e:
        plan = _heuristic_plan(project, proposal, options)
        method, note = "heuristic", str(e)
    return {**plan, "options": options, "based_on": based_on, "method": method, "note": note, "generated_at": _now()}
