"""End-to-end smoke test of stages 1-5 against the live external APIs.

Run from backend/:  python -m scripts.smoke_test [github_url]
"""
import sys

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def check(r, step):
    if r.status_code >= 400:
        sys.exit(f"{step} failed ({r.status_code}): {r.text}")
    return r.json()


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    print("health:", check(client.get("/api/health"), "health"))
    project = check(client.post("/api/projects", json={
        "title": "Retrieval-augmented automated code review",
        "idea_text": (
            "An assistant that reviews pull requests using retrieval-augmented generation over the "
            "repository code and past review comments. We evaluate precision and recall of detected "
            "bugs against human reviewers on an open-source benchmark."
        ),
        "github_url": url,
        "domain": "Software Engineering",
    }), "create")
    pid = project["id"]

    prof = check(client.post(f"/api/projects/{pid}/analyze"), "analyze")["profile"]
    print(f"\n[2] profile ({prof['method']}):", prof["profile"]["keywords"])
    print("    techniques:", prof["profile"]["techniques"])
    print("    queries:", prof["profile"]["search_queries"])

    lit = check(client.post(f"/api/projects/{pid}/literature"), "literature")["literature"]
    print(f"\n[3] literature ({lit['embedding_backend']}):", lit["retrieved_per_source"], lit["errors"])
    for p in lit["papers"][:6]:
        print(f"    {p['similarity']:.3f}  {p['year']}  {p['source']:<16} {p['title'][:80]}")

    score = check(client.post(f"/api/projects/{pid}/score"), "score")["score"]
    print(f"\n[4] ROS = {score['total']} ({score['band']})")
    for d in score["dimensions"]:
        print(f"    {d['name']:<38} {d['score']:>4}")
    print("\n[5] gaps:", [g["title"] for g in score["gaps"]])
    print("    modifications:", score["modifications"])

    client.delete(f"/api/projects/{pid}")
    print("\nOK")


if __name__ == "__main__":
    main()
