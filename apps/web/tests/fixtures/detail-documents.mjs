// Representative author-written examples; never production content or measured research results.
export async function detailDocuments(compileDocument) {
  const documents = [];
  for (const locale of ["ko", "en"]) {
    const ko = locale === "ko";
    const cases = [
      {
        slug: "research/hybrid-retrieval",
        kind: "DOC",
        tags: ["NLP", "Retrieval"],
        title: ko
          ? "하이브리드 검색: 단어와 의미를 함께 읽기"
          : "Hybrid retrieval: words meet meaning",
        description: ko
          ? "Sparse·dense 검색과 재정렬의 역할을 작은 예제로 설명하는 기술 문서."
          : "A technical note on sparse and dense retrieval, fusion and reranking.",
        body: ko
          ? `## 검색은 하나의 점수가 아니다\n\n키워드 검색은 정확한 용어를, 벡터 검색은 표현이 달라도 비슷한 의미를 찾는 데 도움이 됩니다. 두 결과를 합치는 방법과 최종 평가를 구분해야 합니다.\n\n### 서로 다른 실패\n\n코드의 함수 이름은 정확히 일치해야 할 수 있고, 개념을 묻는 질문에는 동의어나 다른 언어의 표현이 등장할 수 있습니다.\n\n:::callout{tone="note"}\n이 글은 상세 페이지 미리보기용 예시입니다. 실제 프로젝트의 측정 결과가 아닙니다.\n:::\n\n## 순위를 합치는 방법\n\n점수의 척도를 억지로 같게 만들기보다 순위를 이용할 수 있습니다.\n\n$$\nRRF(d) = \\sum_{r \\in R} \\frac{1}{k + rank_r(d)}\n$$\n\n\`\`\`python\ndef reciprocal_rank(rank: int, k: int = 60) -> float:\n    return 1.0 / (k + rank)\n\`\`\`\n\n## 파이프라인\n\n\`\`\`mermaid\nflowchart LR\n    Q[Query] --> S[Sparse search]\n    Q --> D[Dense search]\n    S --> F[Fusion]\n    D --> F\n    F --> R[Reranking]\n\`\`\`\n\n## 평가를 분리하기\n\n| 확인 항목 | 질문 |\n| --- | --- |\n| Recall | 필요한 문서가 후보에 들어오는가? |\n| nDCG | 관련성이 높은 문서가 위에 놓이는가? |\n| 지연 | 읽기 흐름을 방해하지 않는가? |\n\n[콘텐츠 처리 파이프라인](/ko/examples/docs/content-pipeline)과 [표현 학습 연구](/ko/examples/research/representation-learning)를 이어서 읽을 수 있습니다.`
          : `## Retrieval is not one score\n\nLexical retrieval preserves exact terminology; dense retrieval can connect different expressions of a similar idea. Fusion and final evaluation are separate decisions.\n\n### Different failure modes\n\nFunction names may require exact matches, while conceptual questions use synonyms or other languages.\n\n:::callout{tone="note"}\nThis is a reading-layout example, not a measured project result.\n:::\n\n## Rank fusion\n\n$$\nRRF(d) = \\sum_{r \\in R} \\frac{1}{k + rank_r(d)}\n$$\n\n\`\`\`python\ndef reciprocal_rank(rank: int, k: int = 60) -> float:\n    return 1.0 / (k + rank)\n\`\`\`\n\n## Pipeline\n\n\`\`\`mermaid\nflowchart LR\n    Q[Query] --> S[Sparse search]\n    Q --> D[Dense search]\n    S --> F[Fusion]\n    D --> F\n    F --> R[Reranking]\n\`\`\`\n\n## Evaluation\n\n| Measure | Question |\n| --- | --- |\n| Recall | Is the relevant document a candidate? |\n| nDCG | Is the more useful result ranked higher? |\n| Latency | Does it preserve the reading flow? |\n\nContinue with [content processing](/en/examples/docs/content-pipeline).`,
      },
      {
        slug: "research/representation-learning",
        kind: "RESEARCH_PROGRAM",
        tags: ["NLP", "Representation"],
        title: ko ? "표현 학습의 연구 질문" : "Questions for representation learning",
        description: ko
          ? "가설·실험·평가를 구분한 연구 노트의 화면 예시."
          : "A research note that separates hypotheses, experiments and evaluation.",
        body: ko
          ? `## 문제 설정\n\n어떤 입력의 차이는 유지하고 어떤 차이는 제거할 것인가? 표현의 유용성은 해결하려는 문제에 따라 달라집니다.\n\n## 가설과 반례\n\n멀티모달 입력을 동일한 차원으로 변환했다고 의미가 정렬된 것은 아닙니다. 서로 다른 설명·시간 구간·시각 단위를 어떻게 대응시킬지 검증해야 합니다.\n\n:::callout{tone="warning"}\n제안된 연구 질문이며 성능 향상이나 가설 검증이 완료된 결과가 아닙니다.\n:::\n\n### 먼저 비교할 것\n\n- 같은 데이터와 평가셋의 단일 모달리티 기준선\n- 모달리티별 전처리의 영향\n- 의미 정렬과 정보 손실의 차이\n\n## 후속 문서\n\n[하이브리드 검색](/ko/examples/research/hybrid-retrieval)에서 표현을 검색 기능에 연결하는 예시를 볼 수 있습니다.`
          : `## Problem setting\n\nWhich differences should a representation preserve? Its usefulness depends on the task.\n\n## Hypotheses and counterexamples\n\nEqual vector dimensions do not imply aligned semantics. Correspondence across descriptions, time intervals and visual units must be tested.\n\n:::callout{tone="warning"}\nThese are proposed research questions, not verified improvements.\n:::\n\n### Comparisons\n\n- Single-modality baselines on the same data\n- Effects of modality-specific processing\n- Alignment versus information loss\n\n## Next reading\n\nSee [hybrid retrieval](/en/examples/research/hybrid-retrieval).`,
      },
      {
        slug: "work/archive-architecture",
        kind: "PROJECT",
        tags: ["Web", "Architecture"],
        title: ko
          ? "읽기와 작성을 분리하는 아카이브"
          : "An archive with separate reading and authoring",
        description: ko
          ? "문제·구조·설계 선택·보안 경계를 보여주는 프로젝트 사례 화면."
          : "A project case-study layout for requirements, design decisions and security boundaries.",
        body: ko
          ? `## 해결하려는 문제\n\n공개 사이트의 읽기 경험을 유지하면서 작성·발행 작업은 별도의 관리 화면에서 수행합니다.\n\n## 구성\n\n\`\`\`mermaid\nflowchart LR\n  Reader[Public reader] --> Web[Next.js]\n  Editor[Private CMS] --> Core[API and worker]\n  Web --> Core\n  Core --> DB[(PostgreSQL)]\n\`\`\`\n\n## 설계 선택\n\n| 경계 | 선택 | 확인할 것 |\n| --- | --- | --- |\n| 공개 읽기 | 발행된 revision만 노출 | 비공개 원문 누출 방지 |\n| 작성 | private 관리 화면 | 관리자 권한 검증 |\n| 발행 | 원문과 render artifact 분리 | 캐시 갱신 |\n\n### 변경을 되돌릴 수 있게\n\n문서를 수정하는 작업과 독자에게 공개하는 작업을 분리합니다. 이 예시는 실제 운영 데이터를 바꾸지 않습니다.\n\n## 시연 영역\n\n::hf-demo{space="m97j/knowledge-engine" title="Knowledge engine demo"}\n\n외부 시연은 해당 제공자의 처리·가용성에 따릅니다. 로컬 자동 검증에서는 외부 요청을 차단합니다.`
          : `## The problem\n\nKeep public reading available while editing and publication happen in a separate private interface.\n\n## Architecture\n\n\`\`\`mermaid\nflowchart LR\n  Reader[Public reader] --> Web[Next.js]\n  Editor[Private CMS] --> Core[API and worker]\n  Web --> Core\n  Core --> DB[(PostgreSQL)]\n\`\`\`\n\n## Design choices\n\n| Boundary | Choice | Check |\n| --- | --- | --- |\n| Reading | Published revisions | No private source leakage |\n| Authoring | Private CMS | Administrator authorization |\n| Publication | Source and artifact separation | Cache invalidation |\n\n### Reversible changes\n\nEditing and publishing are different actions. This example changes no live data.\n\n## Demo\n\n::hf-demo{space="m97j/knowledge-engine" title="Knowledge engine demo"}\n\nExternal demos have separate provider processing. Automated local checks block external requests.`,
      },
      {
        slug: "docs/content-pipeline",
        kind: "DOC",
        tags: ["NLP", "Web"],
        title: ko ? "원문을 보존하는 문서 처리" : "Document processing without losing the source",
        description: ko
          ? "코드·수식·embed를 분리해 다루는 구현 안내 화면."
          : "A guide layout with code, equations, embeds and separate source preservation.",
        body: ko
          ? `## 원문과 결과물\n\nMarkdown 원문은 보존하고, 컴파일한 HTML과 메타데이터는 재생성할 수 있는 결과물로 다룹니다.\n\n### 보호해야 할 구조\n\n코드 블록·수식·링크 주소·embed 설정을 번역 대상 문장과 구분합니다.\n\n\`\`\`ts\ninterface Publication {\n  sourceHash: string;\n  revision: number;\n  html: string;\n}\n\`\`\`\n\n## 확인 순서\n\n1. 원문 지문 확인\n2. 구문 분석과 안전한 변환\n3. 형식 보존 검증\n4. 관리자 검토 후 발행\n\n> 자동 변환의 성공은 내용의 정확성까지 보장하지 않습니다.\n\n## 영상 embed 형식\n\n::youtube{id="M7lc1UVf-VE" title="Embed layout example"}\n\n위 영역은 렌더링 형식 확인용입니다. 자동 테스트는 외부 영상을 가져오지 않습니다.`
          : `## Source and artifacts\n\nPreserve Markdown source. Compiled HTML and metadata are reproducible artifacts.\n\n### Protected structures\n\nCode, math, links and embed configuration are separate from translation prose.\n\n\`\`\`ts\ninterface Publication {\n  sourceHash: string;\n  revision: number;\n  html: string;\n}\n\`\`\`\n\n## Validation\n\n1. Verify the source hash\n2. Parse and safely transform\n3. Check protected formats\n4. Review before publication\n\n> A successful conversion does not prove semantic accuracy.\n\n## Video layout\n\n::youtube{id="M7lc1UVf-VE" title="Embed layout example"}\n\nAutomated checks do not fetch external videos.`,
      },
      {
        slug: "logs/evaluation-notes",
        kind: "LOG_ENTRY",
        tags: ["NLP", "Learning"],
        title: ko
          ? "평가 기록: 좋아진 것과 남은 것"
          : "Evaluation notes: improvements and open questions",
        description: ko
          ? "짧은 공부·실험 기록에 적용되는 공통 읽기 화면."
          : "The same reading layout for a short learning and experiment log.",
        body: ko
          ? `## 오늘 확인한 것\n\n지표 하나를 높이는 것과 실제 문서의 오류를 줄이는 것은 같지 않습니다. 부정문·수식 주변 설명·전문용어를 따로 검토했습니다.\n\n## 다음 확인\n\n- 평가 문장과 학습 자료 분리\n- 문맥이 긴 단락의 오류\n- 사람이 검토한 기준 번역\n\n[문서 처리 방식](/ko/examples/docs/content-pipeline)에서 형식 검증을 이어서 읽을 수 있습니다.\n\n이 기록은 화면 예시이며 실제 실험 완료를 주장하지 않습니다.`
          : `## Observation\n\nA higher score is not the same as fewer errors in real documents. Negation, prose around equations and terminology need separate checks.\n\n## Next checks\n\n- Separate evaluation and training data\n- Longer paragraphs\n- Human-reviewed references\n\nContinue with [document processing](/en/examples/docs/content-pipeline). This is a layout example, not a completed experiment claim.`,
      },
    ];
    for (const [index, example] of cases.entries()) {
      const body = example.body.replaceAll("\\n", "\n");
      const source = `---\ntitle: ${JSON.stringify(example.title)}\ntags: ${JSON.stringify(example.tags)}\n---\n\n${body}\n`;
      documents.push({
        contentId: `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
        locale,
        kind: example.kind,
        path: `/${locale}/examples/${example.slug}`,
        title: example.title,
        description: example.description,
        publishedAt: "2026-10-14T00:00:00.000Z",
        tags: example.tags,
        revisionNumber: 1,
        artifact: await compileDocument(source, { locale }),
      });
    }
  }
  return documents;
}
