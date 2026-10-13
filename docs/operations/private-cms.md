# Private CMS and inference rollout

## Verified release — 2026-10-13

- Production CMS/API/worker and reader builds deployed; Vercel management routes return 404.
- The owner confirmed password login and CMS entry in the actual private HF App iframe.
- An independently seeded, valid real-user session confirmed deployed CMS access and mobile
  layout. This check did not exercise a refresh token or months-long persistence.
- Actual owner API creation, two revisions, review, publication, archive and restore passed.
  The scoped cache update was observed after 0.81 seconds; this is not a latency SLA.
- Additive migration `0008` followed a fresh encrypted backup, isolated restore and durable
  private dataset preservation. All pre-existing application rows and legacy rows matched.
- Real CPU inference, queued publication embedding, hybrid search, and translation-to-draft
  passed. Original source, code, math and image URLs remained intact; hidden vectors were
  excluded from public search. No model-quality benchmark or SOTA claim is implied.
- Test documents remain private and archived, not deleted. Paid APIs and activity collection
  remain disabled. Visual layout releases and personalization remain future features.

## Configuration

Set these only on `m97j/archive-core`, never as browser-visible variables:

| Key                                  | Role                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `CMS_PUBLIC_URL`                     | `https://m97j-archive-core.hf.space`                                    |
| `SUPABASE_URL`                       | Existing archive-db HTTPS project URL                                   |
| `SUPABASE_PUBLISHABLE_KEY`           | Supabase publishable key for user login; not a DB password              |
| `CMS_SESSION_SECRET`                 | Random server-only signing key, at least 32 characters                  |
| `CMS_COOKIE_MODE`                    | `embedded` for the HF iframe; `top-level` for standalone app usage      |
| `CMS_IDLE_DAYS`, `CMS_REMEMBER_DAYS` | Defaults 90 and 180                                                     |
| `KNOWLEDGE_ENGINE_BASE_URL`          | `https://m97j-knowledge-engine.hf.space`                                |
| `KNOWLEDGE_ENGINE_API_KEY`           | Same random secret as the inference Space's `ARCHIVE_INFERENCE_API_KEY` |
| `AI_PROVIDER_ENABLED`                | Default false; enable only after model and DB rollout checks            |

Existing DB/JWKS/outbox settings remain unchanged. Co-located CMS→API requests use loopback,
not an HF access token. The gateway supplies a configured host/protocol for origin validation.
All CMS responses are private/no-store/noindex. Cookies are Secure/HttpOnly, with partitioning
in embedded mode; actual HF iframe/browser verification remains a separate deployment check.
HF's iframe cookie restrictions mean remembered sessions are not guaranteed on every browser.

If enabling R2 uploads, its bucket CORS rule must allow the HF CMS app origin (and port 3001
locally). Imgur inline rendering remains unchanged and requires no such upload adapter.

Public Vercel needs only the private API upstream token and cache-webhook secret for these
features, not a Supabase service-role credential. Old integrated Supabase environment variables
can remain unused; removing or rotating them requires reviewing other consumers first.

## Workflow and release gates

1. Frozen dependency install, lint/types, unit/security tests and production builds.
2. Desktop/mobile CMS and reader tests with synthetic fixtures; do not label these real-account tests.
3. Public source audit, main-only commit/push. Private local evidence and development history stay local.
4. DB workflow plan, fresh encrypted backup, isolated restore/fingerprint verification, then additive
   `0008_publication_embeddings` migration. Keep original content and tables.
5. Private HF core synchronization, Vercel Git deployment and allowlisted knowledge-engine source
   deployment. Preserve existing source/history and the public search demo.
6. Real protected API and owner browser authoring/publication/cache checks. A health response,
   successful CI, synthetic fixture or configured Secret is not proof of these checks.

Inference endpoints are stateless and machine-authenticated. CPU translation is an optional
Marian baseline with pinned model revisions and recorded license attribution, not a SOTA claim.
Quality acceptance requires evaluation on actual technical documents. Paid providers, training,
ZeroGPU conversion and visitor tracking are not activated by this rollout.

## Future privacy activation

Consent banners are UI, not a complete legal basis. Cookies are not inherently encrypted;
random IDs can still be personal data. Requirements differ by jurisdiction and purpose, and
some narrowly defined analytics uses have exceptions. The chosen implementation nevertheless
uses opt-in before optional tracking, equivalent decline/accept actions and easy withdrawal.
Review processing notice, retention, international transfers and tested subject-data erasure
including repository history before enabling either analysis flag. Do not place health records,
credentials or arbitrary enterprise logs in this general archive dataset pipeline.
