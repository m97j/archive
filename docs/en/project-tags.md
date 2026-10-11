---
title: Project Tags
permalink: /en/project-tags.html
---

# Project Tags

Tags form a bounded retrieval vocabulary for the evidence each project contributes to the central
research program. They are not an inventory of every technology used.

## Lead research program

| Tag                         | Scope                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `verifiable-agent-learning` | Reasoning, planning, learning, post-training, and controlled comparisons in verifiable environments |

Reserve this lead tag for Axiom World. Add at most two verified method tags from `post-training`,
`closed-loop-planning`, and `evaluation-reproducibility`.

## Supporting research tracks

Assign one primary track to each supporting project whenever possible.

| Tag                       | Scope                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| `multimodal-perception`   | Recognition and representation learning across pose, video, and sensors          |
| `grounded-language-agent` | Dialogue and language agents using state, retrieved evidence, and tools          |
| `adaptive-game-ai`        | In-game decisions using rule-based control, planning, and reinforcement learning |

## Engineering role

Use at most two roles that were actually implemented and evaluated.

| Tag                       | Scope                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| `ml-systems`              | Training, evaluation, inference, packaging, and serving                  |
| `research-infrastructure` | Protocols, frozen suites, lineage, statistics, and reproducibility tools |
| `application-platform`    | Web/API development, data models, identity, and UI                       |
| `cloud-delivery`          | Containers, IaC, CI/CD, observability, and deployment security           |

## Evidence status

Use exactly one of `released-research`, `active-research`, `production`, `prototype`,
`coursework`, or `archived`. Planned capabilities belong in a roadmap rather than in tags.

Examples:

- Axiom World v1: `verifiable-agent-learning`, `post-training`,
  `evaluation-reproducibility`, `released-research`
- Uni-HAR: `multimodal-perception`, `ml-systems`, `active-research`
- CWIE and Pragmatic Agent: `grounded-language-agent`, `ml-systems`, `prototype`
- ATC: `adaptive-game-ai`, `application-platform`, `prototype`
- Archive before deployment: `application-platform`, `cloud-delivery`, `prototype`

[Back to the portfolio](./)
