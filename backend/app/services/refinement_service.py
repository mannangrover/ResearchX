"""Stage 6 — Interactive refinement.

An advisor conversation grounded in the project's evidence (profile, closest
papers, score, gaps) that ends in a structured refined proposal the user edits
and approves. Each LLM step has a template fallback so the stage still works
without an API key.

Stored shape (projects.refinement):
    {"messages": [{"role": "assistant"|"user", "content": str, "at": iso}],
     "proposal": {...} | None, "approved": bool, "derived_project_id": str | None,
     "method": "llm"|"heuristic"}
"""
from datetime import datetime, timezone

from . import llm_service
from .llm_scoring_service import build_evidence

ADVISOR_SYSTEM = (
    "You are ResearchX's research advisor talking with a student about their project. "
    "Be concise (under 170 words), concrete and encouraging but honest. Ground every suggestion "
    "in the evidence provided (cite related papers by short title). Never claim an idea is novel. "
    "Ask at most two questions per reply. The student makes the final decisions."
)

PROPOSAL_FIELDS = {
    "refined_title": "Short, specific project title",
    "problem_statement": "2-3 sentences: the precise problem and why it matters",
    "approach": "2-3 sentences: method, data and evaluation",
    "research_questions": "list of 2-4 research questions",
    "contributions": "list of 2-4 expected contributions",
    "differentiation": "1-2 sentences: how it differs from the closest papers (name them)",
    "assumptions": "list of key assumptions",
    "constraints": "list of constraints agreed in the discussion (time, data, compute, skills)",
    "out_of_scope": "list of things deliberately excluded",
    "changes_from_original": "list of what changed compared with the original idea",
}
LIST_FIELDS = {k for k, v in PROPOSAL_FIELDS.items() if v.startswith("list")}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _context(project: dict) -> str:
    score = project["score"]
    gaps = "\n".join(f"- {g['title']}: {g['description']}" for g in score.get("gaps", []))
    mods = "\n".join(f"- {m}" for m in score.get("modifications", []))
    rqs = "\n".join(f"- {q}" for q in score.get("research_questions", []))
    weakest = sorted(score["dimensions"], key=lambda d: d["score"])[:2]
    return (
        f"{build_evidence(project)}\n\n"
        f"RESEARCH OPPORTUNITY SCORE: {score['total']}/100 ({score['band']}); weakest dimensions: "
        + ", ".join(f"{d['name']} {d['score']}/10" for d in weakest)
        + f"\nRESEARCH GAPS FOUND:\n{gaps or '- none'}\nSUGGESTED MODIFICATIONS:\n{mods or '- none'}"
        f"\nCANDIDATE RESEARCH QUESTIONS:\n{rqs or '- none'}"
    )


def _transcript(messages: list[dict]) -> str:
    return "\n\n".join(f"{'STUDENT' if m['role'] == 'user' else 'ADVISOR'}: {m['content']}" for m in messages)


def _new_state() -> dict:
    return {"messages": [], "proposal": None, "approved": False, "derived_project_id": None, "method": "llm"}


# ------------------------------------------------------------------ opening
def _heuristic_opening(project: dict) -> str:
    score = project["score"]
    closest = project["literature"]["papers"][0]["title"] if project["literature"]["papers"] else "existing work"
    directions = [g["title"] for g in score.get("gaps", [])][:3] or score.get("modifications", [])[:3]
    lines = [
        f"Your idea scored {score['total']}/100 ({score['band']}). The closest existing work is "
        f"“{closest}”, so the project needs a clear differentiator.",
        "",
        "Possible directions based on the gaps found:",
        *[f"{i}. {d}" for i, d in enumerate(directions, 1)],
        "",
        "Which direction interests you most, and what are your constraints (time available, data, compute)?",
    ]
    return "\n".join(lines)


def start(project: dict) -> dict:
    """Create the advisor's opening message (idempotent)."""
    state = project.get("refinement") or _new_state()
    if state["messages"]:
        return state
    prompt = f"""{_context(project)}

Write your OPENING message to the student:
1. One or two sentences diagnosing the score (why it is what it is, citing the closest paper).
2. Two or three numbered, concrete refinement directions, each 1-2 sentences, each tied to a gap or paper above.
3. Ask which direction they prefer and about their constraints (timeline, data access, compute, team skills).
Return JSON: {{"reply": "<message text, use \\n for line breaks>"}}"""
    try:
        reply = llm_service.complete_json(ADVISOR_SYSTEM, prompt, 900)["reply"]
        state["method"] = "llm"
    except (llm_service.LLMUnavailable, KeyError):
        reply = _heuristic_opening(project)
        state["method"] = "heuristic"
    state["messages"].append({"role": "assistant", "content": str(reply).strip(), "at": _now()})
    return state


# ------------------------------------------------------------------ chat
def reply(project: dict, user_text: str) -> dict:
    state = start(project)  # make sure the opening exists
    state["messages"].append({"role": "user", "content": user_text.strip(), "at": _now()})
    prompt = f"""{_context(project)}

CONVERSATION SO FAR:
{_transcript(state['messages'])}

Reply to the student's last message as the ADVISOR. Respond to what they said, refine the direction
with them, and point out risks or missing pieces. If the direction is clear enough, suggest they click
"Draft refined proposal". Return JSON: {{"reply": "<message text>"}}"""
    try:
        text = llm_service.complete_json(ADVISOR_SYSTEM, prompt, 900)["reply"]
    except (llm_service.LLMUnavailable, KeyError):
        text = ("(LLM unavailable, so I can't discuss in detail.) Noted. When your direction and constraints "
                "are clear, click “Draft refined proposal” and edit the draft yourself.")
    state["messages"].append({"role": "assistant", "content": str(text).strip(), "at": _now()})
    state["approved"] = False  # the discussion moved on, so the proposal needs re-approval
    return state


# ------------------------------------------------------------------ proposal
def _normalise(raw: dict, project: dict) -> dict:
    out = {}
    for key in PROPOSAL_FIELDS:
        value = raw.get(key)
        if key in LIST_FIELDS:
            if isinstance(value, str):
                value = [v.strip("-• ").strip() for v in value.splitlines() if v.strip()]
            out[key] = [str(v).strip() for v in (value or []) if str(v).strip()]
        else:
            out[key] = str(value or "").strip()
    out["refined_title"] = out["refined_title"] or f"{project['title']} (refined)"
    return out


def _heuristic_proposal(project: dict, state: dict) -> dict:
    score = project["score"]
    user_notes = [m["content"] for m in state["messages"] if m["role"] == "user"]
    closest = [p["title"] for p in project["literature"]["papers"][:2]]
    return _normalise({
        "refined_title": f"{project['title']} (refined)",
        "problem_statement": project["idea_text"] or project["profile"]["profile"].get("problem", ""),
        "approach": project["profile"]["profile"].get("approach", ""),
        "research_questions": score.get("research_questions", []),
        "contributions": [g["title"] for g in score.get("gaps", [])][:3],
        "differentiation": "Differs from: " + "; ".join(closest) if closest else "",
        "assumptions": [],
        "constraints": user_notes[-3:],
        "out_of_scope": [],
        "changes_from_original": score.get("modifications", []),
    }, project)


def propose(project: dict) -> dict:
    state = start(project)
    fields = "\n".join(f'"{k}": {v}' for k, v in PROPOSAL_FIELDS.items())
    prompt = f"""{_context(project)}

ORIGINAL IDEA: {project['title']} - {project['idea_text']}

CONVERSATION:
{_transcript(state['messages'])}

Write the REFINED RESEARCH PROPOSAL that reflects what the student chose in the conversation
(their preferred direction and constraints). Be specific and realistic for a student team.
Return JSON with exactly these keys:
{fields}"""
    try:
        state["proposal"] = _normalise(llm_service.complete_json(ADVISOR_SYSTEM, prompt, 1600), project)
    except llm_service.LLMUnavailable:
        state["proposal"] = _heuristic_proposal(project, state)
    state["approved"] = False
    return state


def save_proposal(project: dict, proposal: dict, approved: bool) -> dict:
    state = project.get("refinement") or _new_state()
    state["proposal"] = _normalise(proposal, project)
    state["approved"] = approved
    return state


def spinoff_input(project: dict) -> dict:
    """Stage-1 input for a new project built from the approved proposal."""
    p = project["refinement"]["proposal"]
    rqs = " ".join(f"RQ{i}: {q}" for i, q in enumerate(p["research_questions"], 1))
    idea = " ".join(x for x in (p["problem_statement"], p["approach"], rqs) if x)
    return {"title": p["refined_title"][:200], "idea_text": idea[:20000],
            "github_url": project["github_url"], "domain": project["domain"]}
