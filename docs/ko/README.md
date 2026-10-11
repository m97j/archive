---
title: Archive — 정적 포트폴리오
permalink: /ko/
---

# Archive — 정적 포트폴리오

[홈](../) · [프로젝트 태그](project-tags.html) · [English](../en/)

이 문서는 [Archive](https://marchivej.vercel.app)의 정적 fallback입니다. 주 서비스가 일시적으로
접근되지 않더라도 GitHub 저장소와 GitHub Pages에서 핵심 프로젝트와 연구 방향을 확인할 수
있도록, 외부 서비스에 의존하지 않는 간결한 요약만 담습니다.

## 관심 영역

중심 연구는 검증 가능한 환경에서 에이전트의 추론·계획·학습을 측정하고 개선하는 것입니다.
다음 문제를 하나의 연구 프로그램과 보조 프로젝트로 연결합니다.

- 재현 가능한 post-training과 비교 실험
- 규칙에 기반한 추론, 계획과 deterministic verification
- 부분 관측 환경의 belief-state 및 closed-loop interaction
- 지각·검색·대화·행동을 연결하는 보조 지능형 시스템
- 연구 주장과 실행 artifact를 연결하는 평가·재현성 인프라

## Lead project

### [Axiom World](https://github.com/m97j/axiom-world)

완전히 검증 가능한 toy world에서 rule-grounded planning을 연구하는 사전등록 연구 프로젝트입니다.
Protocol v1은 single-GPU 조건에서 general reasoning SFT 후 task SFT를 수행하는 2단계 방식과 직접
task tuning을 비교하고, 동결된 평가 suite·artifact lineage·3-seed 확인으로 결론을 검증했습니다.
DPO의 제한적 효과와 verifier-rewarded GRPO의 성능 저하도 실패 분석과 함께 공개합니다. 다음
Protocol v2는 부분 관측 환경에서 명시적 belief-state와 closed-loop planning을 연구합니다.

[Tech report](https://github.com/m97j/axiom-world/blob/main/docs/reports/v1/axiom-world-tech-report-v1.md) ·
[사전등록 protocol](https://github.com/m97j/axiom-world/blob/main/docs/protocols/v1/experiment_protocol_v1.md) ·
[HF collection](https://huggingface.co/collections/m97j/axiom-world)

## 보조 프로젝트

### [Archive](https://github.com/m97j/archive)

다국어 기술·학술 문서, 프로젝트 증거, 연구 기록을 하나의 분류 체계로 관리하는 개인 지식
플랫폼입니다. Next.js, Fastify, PostgreSQL/Supabase, Hugging Face Spaces, Cloudflare R2와
IaC/CI 파이프라인을 사용합니다.

### [Uni-HAR](https://github.com/m97j/uni-har)

자세 시퀀스와 RGB 영상의 정보를 결합하는 멀티스케일 Human Action Recognition 모델입니다.
시간·공간 factorized attention, 장기 시계열 집계, 선택적 cross-attention 융합을 다룹니다.
[모델 카드](https://huggingface.co/m97j/uni-har)

### [CWIE](https://github.com/m97j/cwie)

대화 생성과 함께 신뢰도·관계·이벤트 상태 변화를 예측하는 게임 세계 상호작용 엔진입니다.
LLM 미세조정, 상태 전이, RAG 기반 해석, symbolic/neural 서비스 분리를 실험합니다.
[Symbolic demo](https://huggingface.co/spaces/m97j/symbolic-processor) ·
[Neural demo](https://huggingface.co/spaces/m97j/neuro-engine) ·
[모델 카드](https://huggingface.co/m97j/cwie-core)

### [Pragmatic Agent](https://github.com/m97j/pragmatic-agent)

로컬 검색과 웹 검색을 조합하고, planner와 generator 역할을 분리하여 출처 기반 답변·요약·번역을
생성하는 RAG 에이전트입니다. BM25/dense retrieval, reranking, 검색 예산과 캐시를 다룹니다.
[데모](https://huggingface.co/spaces/m97j/pragmatic-agent)

### [ATC](https://github.com/m97j/atc)

Unity 게임플레이, Node.js 백엔드, MongoDB와 적 AI를 연결한 full-stack 게임 프로젝트입니다.
FSM과 Behavior Tree에서 ML-Agents PPO 정책으로 확장하며 규칙 기반·학습 기반 행동을 비교합니다.
[시연 영상](https://youtu.be/98fkWuGhLA0)

## 기초 구현 기록

- [Machine Learning](https://github.com/m97j/ml-assignments): ID3와 Naive Bayes 직접 구현
- [Data Mining](https://github.com/m97j/dm-assignments): Apriori, PageRank, SVD/NCF 추천
- [Natural Language Processing](https://github.com/m97j/nlp-assignments): BPE, 한글 오토마타,
  KoELECTRA 분류

## 분류 원칙

프로젝트 이름에 이모지 조합을 붙이는 기존 방식 대신, lead research program과 보조 연구
트랙·엔지니어링 역할·증거 상태를 구분합니다. 자세한 기준은
[프로젝트 태그](project-tags.html)에 있습니다.

Kakao 로그인과 Pacman 저장소는 삭제된 것이 아니라 비공개로 전환한 학교 과제물이며, 공개
fallback의 주요 증거 목록에서는 제외합니다.

GitHub: [m97j](https://github.com/m97j) · English: [English portfolio](../en/)

_최종 검토: 2026-09-06_
