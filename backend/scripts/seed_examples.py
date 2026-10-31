"""Run the example projects (scripts/examples.json) through stages 1-5 and save them locally.

Run from backend/:  python -m scripts.seed_examples [title-substring ...]
Then copy them to the demo account with:  python -m scripts.import_local_projects
"""
import json
import sys
import time
from pathlib import Path

from app import database as db
from app.services import pipeline

EXAMPLES = json.loads((Path(__file__).with_name("examples.json")).read_text(encoding="utf-8"))


def run(example: dict) -> None:
    t0 = time.time()
    p = db.create_project(example["title"], example["idea_text"], example["github_url"], example["domain"])
    pid = p["id"]
    p = db.save_stage(pid, "profile", pipeline.run_analysis(p), stage=2)
    lit = pipeline.run_literature(p)
    if not lit["papers"]:
        print(f"  ! no papers found ({'; '.join(lit['errors'])}); stopping at stage 2")
        return
    p = db.save_stage(pid, "literature", lit, stage=3)
    s = pipeline.run_scoring(p)
    db.save_stage(pid, "score", s, stage=4)
    llm = s.get("llm_score") or {}
    print(f"  {pid}  rule {s['total']} ({s['band']})  |  LLM {llm.get('total', '-')} ({llm.get('band', '-')})"
          f"  |  {len(lit['papers'])} papers, closest {lit['papers'][0]['similarity']:.2f}  |  {time.time() - t0:.0f}s")


def main():
    db.init_db()
    wanted = [a.lower() for a in sys.argv[1:]]
    existing = {p["title"] for p in db.list_projects() if p["stage"] >= 4}
    for ex in EXAMPLES:
        if wanted and not any(w in ex["title"].lower() for w in wanted):
            continue
        if not wanted and ex["title"] in existing:
            print(f"- {ex['title']}: already complete, skipped")
            continue
        print(f"- {ex['title']}")
        run(ex)


if __name__ == "__main__":
    main()
