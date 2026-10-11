---
title: Archive — Static Portfolio
permalink: /en/
---

# Archive — Static Portfolio

[Home](../) · [Project tags](project-tags.html) · [한국어](../ko/)

This document is the static fallback for [Archive](https://marchivej.vercel.app). It keeps a
small, repository-backed summary available through GitHub and GitHub Pages when the primary
application or one of its runtime services is temporarily unavailable.

## Focus

My primary research program studies how agents reason, plan, and learn in verifiable interactive
environments. It connects:

- reproducible post-training and comparative experiments;
- rule-grounded reasoning, planning, and deterministic verification;
- belief-state maintenance and closed-loop interaction under partial observability;
- supporting systems for perception, retrieval, dialogue, and action; and
- evaluation infrastructure linking research claims to reproducible artifacts.

## Lead project

### [Axiom World](https://github.com/m97j/axiom-world)

A pre-registered research project studying rule-grounded planning in a fully verifiable toy world.
Under a single-GPU budget, Protocol v1 compares two-stage general-reasoning SFT → task SFT with
direct task tuning, using frozen evaluation suites, enforced artifact lineage, and a three-seed
confirmation. It also publishes negative findings and failure analyses for DPO and
verifier-rewarded GRPO. Protocol v2 extends the program to explicit belief states and closed-loop
planning under partial observability.

[Tech report](https://github.com/m97j/axiom-world/blob/main/docs/reports/v1/axiom-world-tech-report-v1.md) ·
[Pre-registered protocol](https://github.com/m97j/axiom-world/blob/main/docs/protocols/v1/experiment_protocol_v1.md) ·
[HF collection](https://huggingface.co/collections/m97j/axiom-world)

## Supporting projects

### [Archive](https://github.com/m97j/archive)

A personal knowledge platform for multilingual technical and academic writing, project evidence,
and research logs. It uses Next.js, Fastify, PostgreSQL/Supabase, Hugging Face Spaces, Cloudflare
R2, and reproducible IaC/CI workflows.

### [Uni-HAR](https://github.com/m97j/uni-har)

A multi-scale Human Action Recognition model that fuses pose sequences and RGB video. It explores
factorized temporal/spatial attention, long-range temporal aggregation, and optional
cross-attention fusion. [Model card](https://huggingface.co/m97j/uni-har)

### [CWIE](https://github.com/m97j/cwie)

A game-world interaction engine that generates dialogue while predicting changes in trust,
relationships, and event state. It explores LLM fine-tuning, state transitions, RAG-based
interpretation, and separated symbolic/neural services.
[Symbolic demo](https://huggingface.co/spaces/m97j/symbolic-processor) ·
[Neural demo](https://huggingface.co/spaces/m97j/neuro-engine) ·
[Model card](https://huggingface.co/m97j/cwie-core)

### [Pragmatic Agent](https://github.com/m97j/pragmatic-agent)

A RAG agent combining local and Web retrieval with separate planner and generator roles to create
source-grounded answers, summaries, and translations. It includes BM25/dense retrieval,
reranking, search budgets, and caching. [Demo](https://huggingface.co/spaces/m97j/pragmatic-agent)

### [ATC](https://github.com/m97j/atc)

A full-stack game project connecting Unity gameplay, a Node.js backend, MongoDB, and enemy AI. It
extends FSM and Behavior Tree agents with ML-Agents PPO policies to compare rule-based and learned
behavior. [Demo video](https://youtu.be/98fkWuGhLA0)

## Foundations

- [Machine Learning](https://github.com/m97j/ml-assignments): implementations of ID3 and Naive
  Bayes
- [Data Mining](https://github.com/m97j/dm-assignments): Apriori, PageRank, and SVD/NCF
  recommendation
- [Natural Language Processing](https://github.com/m97j/nlp-assignments): BPE, Hangul automata,
  and KoELECTRA classification

## Classification

The former emoji combinations have been replaced with a bounded vocabulary separating the lead
research program, supporting tracks, engineering roles, and evidence status. See
[project tags](project-tags.html).

The Kakao login and Pacman repositories are private coursework rather than deleted projects. They
are intentionally omitted from the public fallback's primary evidence list.

GitHub: [m97j](https://github.com/m97j) · 한국어: [한국어 포트폴리오](../ko/)

_Last reviewed: 2026-09-06_
