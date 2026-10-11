---
title: 프로젝트 태그
permalink: /ko/project-tags.html
---

# 프로젝트 태그

태그는 사용 기술 전체를 나열하는 대신 각 프로젝트가 중심 연구 프로그램에 제공하는 증거를
찾기 위한 제한된 분류어로 사용합니다.

## 중심 연구 프로그램

| 태그                        | 범위                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| `verifiable-agent-learning` | 검증 가능한 환경에서의 추론·계획·학습, post-training 및 비교 실험 |

Axiom World에만 이 lead tag를 사용합니다. 세부 연구 방법은 `post-training`,
`closed-loop-planning`, `evaluation-reproducibility` 중 실제 검증한 항목을 최대 두 개까지
추가합니다.

## 보조 연구 트랙

보조 프로젝트마다 원칙적으로 하나의 주 트랙만 지정합니다.

| 태그                      | 범위                                                      |
| ------------------------- | --------------------------------------------------------- |
| `multimodal-perception`   | 자세·영상·센서 정보를 결합한 인식과 표현 학습             |
| `grounded-language-agent` | 상태·검색 근거·도구를 사용하는 대화 및 언어 에이전트      |
| `adaptive-game-ai`        | 규칙 기반 제어, 계획과 강화학습을 이용한 게임 내 의사결정 |

## 엔지니어링 역할

실제로 구현·검증한 역할을 최대 두 개까지 사용합니다.

| 태그                      | 범위                                                |
| ------------------------- | --------------------------------------------------- |
| `ml-systems`              | 학습, 평가, 추론, 모델 패키징과 서빙                |
| `research-infrastructure` | protocol, frozen suite, lineage, 통계와 재현성 도구 |
| `application-platform`    | Web/API, 데이터 모델, 인증과 사용자 인터페이스      |
| `cloud-delivery`          | 컨테이너, IaC, CI/CD, 관측성과 배포 보안            |

## 증거 상태

하나의 상태만 사용합니다: `released-research`, `active-research`, `production`, `prototype`,
`coursework`, `archived`. 계획 중인 기술은 태그가 아니라 roadmap에만 기록합니다.

예시:

- Axiom World v1: `verifiable-agent-learning`, `post-training`,
  `evaluation-reproducibility`, `released-research`
- Uni-HAR: `multimodal-perception`, `ml-systems`, `active-research`
- CWIE·Pragmatic Agent: `grounded-language-agent`, `ml-systems`, `prototype`
- ATC: `adaptive-game-ai`, `application-platform`, `prototype`
- 배포 전 Archive: `application-platform`, `cloud-delivery`, `prototype`

[포트폴리오로 돌아가기](./)
