# Rule-based vs LLM Research Opportunity Score

Project: **Retrieval-augmented automated code review** (https://github.com/qodo-ai/pr-agent)
Date: 2026-10-22 · LLM judge: `gemini-3.5-flash-lite` · LLM runs: 3 · similarity model: sentence-transformers

## Summary

| | Rule-based | LLM (mean of runs) |
|---|---|---|
| Total /100 | **69.9** | **51.7** (σ = 2.0) |
| Band | Moderate | Moderate |

- Agreement: **Moderate agreement** (mean absolute difference 1.92 points on the 0-10 scale)
- Same band: yes; largest disagreement: Technical depth
- Rule-based score is deterministic (σ = 0); LLM total varied by σ = 2.0 across runs

## Per dimension

| Dimension | Weight | Rule | LLM mean | LLM runs | Diff (LLM − rule) |
|---|---|---|---|---|---|
| Literature overlap (novelty space) | 25% | 2.6 | 2.2 | 1.5, 2.5, 2.5 | -0.4 |
| Technical depth | 15% | 10.0 | 4.7 | 4.5, 4.5, 5.0 | -5.3 |
| Feasibility | 15% | 10.0 | 8.5 | 8.5, 8.5, 8.5 | -1.5 |
| Potential impact | 15% | 8.0 | 6.2 | 6.0, 6.0, 6.5 | -1.8 |
| Reproducibility | 10% | 10.0 | 9.0 | 9.0, 9.0, 9.0 | -1.0 |
| Contribution potential | 20% | 5.7 | 4.2 | 4.0, 4.0, 4.5 | -1.5 |

## Reasoning (rule-based evidence vs LLM, first run)

**Literature overlap (novelty space)**

- Rule: Closest paper: “Bugdar: AI-Augmented Secure Code Review for GitHub Pull Requests” (2025), similarity 0.81. Mean similarity of the top-5 papers is 0.75 → high overlap with existing work. Much of this idea appears in prior work; a clear differentiator is needed.
- LLM: The literature list features multiple near-identical 2025 and 2026 papers such as Bugdar and AACR-Bench addressing AI-augmented and repository-level code review.

**Technical depth**

- Rule: 8 techniques identified: Large Language Model Prompt Engineering, Source Code Diff Compression, Webhook-driven Event Processing, AST and Static Diff Parsing via unidiff, Multi-provider LLM Abstraction via LiteLLM. Involves learning-based / AI methods, which usually support experimental depth. Repository has 506 source files in 3 language(s) and 39 declared dependencies.
- LLM: The project combines source code diff compression, AST and static diff parsing via unidiff, and multi-provider LLM abstractions using LiteLLM.

**Feasibility**

- Rule: A working code base already exists, so experiments can start immediately. Dependencies are declared, so the environment is reproducible. The description mentions datasets/metrics/evaluation. 10 related papers are open-access on arXiv (easy to reuse baselines).
- LLM: The project builds upon an existing open-source framework, PR-Agent, with 13535 stars, CI, tests, and a defined evaluation plan against an open-source benchmark.

**Potential impact**

- Rule: 91% of related papers were published in the last 3 years (an active area). Citation counts unavailable for the retrieved papers; a neutral value was used. Repository has 13535 GitHub stars.
- LLM: Automated code review is an active industry pain point to reduce delivery bottlenecks, though the research impact is moderated by heavy concurrent academic attention.

**Reproducibility**

- Rule: Present: README is detailed, dependency file, automated tests, CI workflow, licence, Dockerfile, docs folder.
- LLM: The repository provides high reproducibility signals including 506 code files, MIT license, tests, documentation, a Dockerfile, and dependency configuration.

**Contribution potential**

- Rule: Combines room in the literature (50%), field activity (30%) and technical depth (20%). High overlap limits contribution unless the project is modified.
- LLM: While the framework is robust, the heavy saturation of closely related 2025-2026 papers limits the potential for a distinct conceptual contribution.
