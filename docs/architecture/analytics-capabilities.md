# Analytics capabilities and extension boundaries

Reviewed 2026-10-26. This is an implementation map and research-based design decision,
not a legal opinion, a promise of model accuracy, or activation of additional tracking.

## Current decision

Keep GA4 as the long-term analytics source. Retain the inactive private HF activity Bucket,
keys and capture code. Do not enable section tracking, session replay, raw exports, audience
profiling, paid APIs, training or editing agents as a consequence of this document.

## Events, key events and models

- A no-code event derives a new event from existing measured fields, such as a `page_view`
  for a specific public work overview. It cannot invent unmeasured section reading time.
- A coded event adds instrumentation, for example coarse visible-section engagement after
  explicit consent. Useful fields could be public content ID, revision, section ordinal and
  a duration bucket. Section text, raw pointer streams and free-form input are unnecessary.
- A key event marks an event as an operational goal. It is not a trained model, an API
  endpoint, new storage capacity, an advertising consent, or a new measurement permission.
- GA4 custom events work in Standard. Paid 360 raises selected reporting/processing limits;
  it does not automatically supply visitor-occupation prediction or technical-document review.

References: [event creation](https://support.google.com/analytics/answer/12844695?hl=en),
[collection limits](https://support.google.com/analytics/answer/9267744?hl=en),
[GA4 predictive metrics](https://support.google.com/analytics/answer/9846734?hl=en).

## Reuse collection before building another pipeline

A service can own collection while a separate application owns aggregation, models and UI.
GA4 Standard can export event data to BigQuery (daily export up to 1M events), so an additional
first-party collection endpoint is not intrinsically necessary for sequence analysis/training.
BigQuery storage, queries and streaming have their own limits/costs; a sandbox is bounded and
not permanent free storage. Exporting pseudonymous events creates additional processing,
retention, deletion and transfer obligations. Google's agreement does not automatically cover
an onward HF copy. The current project does not enable BigQuery export.

The GA4 Data API returns reports suitable for private dashboards and content triage. It is not
an unrestricted event-history export or a low-latency recommendation serving system. Report
processing and quality limitations apply. Simple next-read counts can use a reviewed, batched
transition aggregate; they need not retain detailed visitor histories indefinitely.

References: [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1),
[BigQuery export](https://support.google.com/analytics/answer/9358801?hl=en),
[BigQuery sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox).

## Which signals support which feature

| Feature                                  | Sufficient starting point                                                     | Separate implementation                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Related documents                        | Published text, tags, embeddings, editorial links                             | Content ranking, no visitor tracking required                                               |
| Frequently read next                     | Consented page transitions aggregated above a chosen minimum                  | Batched transition graph, quality checks, cached public snapshot                            |
| Adapt to the current reading task        | Public document features and bounded tab-memory interactions                  | Local rules or a small model; inference need not upload behavior                            |
| Infer profession or role                 | Optional declared task/role and validated labeled evaluation                  | A classifier and uncertainty handling; clicks alone do not establish a job                  |
| Find confusing sections                  | Explicitly instrumented, coarse visibility/duration plus qualitative feedback | Statistical analysis; long dwell is not proof of confusion or a factual error               |
| Suggest wording or technical corrections | Versioned source, references, static checks and optional aggregate triage     | Content-analysis rules/LLM, evidence, review; no visitor raw history is inherently required |
| Agent-proposed code changes              | A reviewed issue/bundle and isolated source checkout                          | Trusted agent runtime, credential isolation, tests, human approval before release           |

A visiting professor, engineer and student can produce the same trace. Unsupervised clusters
are not profession labels. Prefer reader-controlled task modes and transparent recommendation
reasons before claiming occupational inference. Prediction must never grant access to private
content. Actual authentication/invitation controls determine access rights.

## Service alternatives

| Service            | Relevant free/paid boundary                                                                                 | Role in this architecture                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GA4 Standard / 360 | Standard supports custom events, reports, Data API and bounded BigQuery export; 360 expands selected limits | Keep as the current source; no upgrade required for basic detailed instrumentation                              |
| PostHog            | Monthly free 1M analytics events, 5K replays and 1M flag requests; usage-based products beyond limits       | A future integrated product-analytics/experimentation option with APIs and exports                              |
| Microsoft Clarity  | Free heatmaps and session recordings                                                                        | UX inspection option, not an arbitrary training-data warehouse; review its controller role and consent behavior |
| Matomo             | Self-hosted core is free software; hosting and premium plugins such as replay can cost money                | More infrastructure/control ownership with associated operating responsibility                                  |
| Amplitude          | Free and paid analytics/replay plans; cohorts, predictions and APIs vary by tier                            | Another product-analytics/experimentation option, not a guaranteed custom occupational classifier               |

PostHog offers a self-service countersigned DPA even on its free plan. Reading its public
preview is not itself execution of that agreement. Clarity's published privacy role differs
from a conventional processor-only service; its denied consent mode may still collect
cookieless data unless the site blocks the tag. No additional service is installed here.

References: [PostHog pricing](https://posthog.com/pricing), [PostHog DPA](https://posthog.com/dpa),
[PostHog exports](https://posthog.com/docs/data-pipelines/batch-exports),
[Clarity FAQ](https://learn.microsoft.com/en-us/clarity/faq),
[Clarity consent](https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-mode),
[Matomo pricing](https://matomo.org/pricing/), [Amplitude pricing](https://www.amplitude.com/pricing).

## Privacy and model operations

Replacing UUIDs with row indices does not by itself anonymize detailed event sequences.
Anonymization requires a real identifiability assessment, including other available data.
Written processor terms, purpose/consent, overseas transfer, retention and deletion are separate
questions. They apply according to actual processing, whether collection code is custom or a
vendor SDK. A product's free tier does not imply either exemption or impossibility.

Keep draft suggestions separate from factual corrections and publications. Aggregate behavior
can prioritize review, but cannot determine the technically correct replacement sentence.
An agent or LLM should produce a proposal against a versioned source; existing review,
publication and cache-invalidation workflows should control the final release.

References: [Korean PIPA Article 58-2](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033214845),
[Article 26](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079723).
