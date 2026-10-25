# Optional session activity: private HF Bucket

## Implemented boundary

This feature is disabled by default. Its two independent choices are `sessionPersonalization` (short session processing) and `modelImprovement` (time-bounded retention for improving the site's recommendation, content-quality and usability systems). Either may be accepted without the other. No personalizing model, role/job inference, model training, public transition graph, Dataset export, paid API or automatic adaptation is activated by these choices.

Basic reading, search and public content-derived related documents do not require activity consent. Declining does not deliberately slow the site. No identity is issued until an accepted optional purpose starts a session. The 90-day signed preference cookie contains only the policy version, two choices and decision time—not a visitor ID. An independent HttpOnly encrypted session cookie ends after 30 minutes idle or 12 hours total; it does not link future visits. A browser's automatic batch retries are bounded, memory-only and use the original batch ID.

Capture goes from the browser to the Vercel collection endpoint and then directly to a **private HF Storage Bucket**, without an archive-core relay or Dataset Git commit. Validation resolves only already published documents using the public-reader catalog/cache. A cold catalog cache with an unavailable core may drop optional events; it does not block reading or save an unverified locator.

Only server-resolved content UUID, locale, revision, event kind, coarse active seconds and h2/h3 section ordinal are stored. Submitted page paths are locators and are discarded. Client IDs are discarded; batch IDs become hashes. Search text, query strings, fragment/heading text, link URL, IP, user agent, email, input contents, job/role, browser fingerprint, precise scroll/mouse traces and country are not activity fields. Provider networking/security logs are separate from this application payload and must be covered by the notice and contract review.

The browser's public revision number is checked against the resolved publication. Old-tab events
that refer to another revision are ignored rather than assigned to new headings. Section dwell
without a coherent revision is not retained; unrelated valid events in the same batch can still pass.

## Storage and retention

The owned prefix is `activity/v2/` only:

- `raw/session/<capability-verifier>/<ttl-seconds>-<batch-hash>.json.enc`: session-only purpose; default logical expiry two hours after the first accepted write.
- `raw/model/<capability-verifier>/<ttl-seconds>-<batch-hash>.json.enc`: model-improvement purpose only; default logical expiry 90 days. No session-only row is copied into this prefix later.
- `control/deleted/` and `control/revoked/`: minimal keyed tombstones preventing late replay; removed after 91 days.
- `control/leases/` and `control/rate/`: short in-flight and per-session write controls, cleaned separately.
- `control/maintenance/last-success.json`: global successful-cleanup heartbeat; no visitor content.

Raw objects use AES-256-GCM application encryption in addition to provider transport/at-rest protection. The key's TTL is fixed when the short session is issued, rather than recomputed from a future environment setting. Retrying a batch cannot overwrite it or restart its retention clock. Policy/retention changes require a new notice/version and review; do not silently repurpose previously captured rows.

Logical expiry is **not physical deletion**. HF currently has no S3 lifecycle rules. An hourly scheduled runner must paginate the whole owned namespace and remove expired/tombstoned raw objects. Normal physical deletion is due in the next hourly sweep, but an outage can delay it. The runner fails on unsuccessful/unsafe responses and does not declare partial work complete. A missing or older-than-two-hour durable heartbeat stops new session starts/capture even if the enable flags remain true. Deletion, read-only readiness and cleanup remain usable with capture disabled. A failure requires alerting, repair and retry; it is not a guarantee that already stored expired bytes vanished during the outage.

The scheduler scans only this prefix and never existing encrypted DB backups, images, other projects or legacy Dataset snapshots. No old production data is migrated or deleted by this implementation. The old `/v1/telemetry/batches` Dataset writer is unavailable by default even if old `ANALYTICS_*` flags are true.

## Withdrawal and deletion

Changing purposes ends the current session. Removing an accepted purpose requests deletion of both purpose copies belonging to that current session, conservatively avoiding reuse under a withdrawn choice. Adding a purpose does not retroactively authorize old data for it; existing raw rows keep their original purpose and expiry.

An explicit recovery action returns a random 32-byte deletion capability for the **current session**. It is not automatically exposed and is not placed in a URL, localStorage, telemetry, logs or server plaintext storage. The server uses a separate HMAC secret to derive an unguessable lookup verifier. A saved capability can delete that session after its browser cookie expires. Without a saved code, an expired session cannot be recovered just from an email or guessed UUID. Tell the visitor this limitation before collection; the scheduled retention deadline still applies. Changing purposes starts a new capability; earlier sessions need their separately saved codes.

`POST /api/privacy/delete` accepts `{}` for a current session or `{ "deleteCode": "<saved code>" }`. The code is never a query parameter. Same-origin checks, body bounds and request budgets apply. A deletion tombstone is durable before any raw deletion. Late writers check it before and after writing and erase their own raced write; a cleanup sweep recovers interrupted writers. The response says `complete: false` while pagination or a live writer remains. Retain the code and retry; the UI must not report completion until `complete: true`. Invalid/foreign random codes cannot select someone else's data. No real name or additional identity document is requested.

If withdrawal encounters a storage outage, the browser stops further collection but the server cannot claim remote deletion. The session capability is retained temporarily for recovery/retry. A current-session deletion does not prove deletion of older sessions or third-party platform logs. There are no raw exports, training runs or visitor datasets yet. Before adding them, implement deletion propagation/lineage, input-expiry enforcement, derived-data and backup handling, and model memorization/unlearning review; leaving only trained weights is not automatically anonymization.

## Operator setup before activation

1. Review the controller name/contact, exact purposes/items, each retention period, withdrawal/rights handling and the `/ko/privacy` or `/en/privacy` notice. Proposed periods are not statutory allowances or a legal certification.
2. Confirm HF's actual contract/processor role, processing location and subprocessors, transfer arrangements and deletion/security conditions for this account. Private/PRO is not a substitute for that review. Official HF documentation advertises DPA through Enterprise and plan-dependent location selection; applicable PRO terms have not been independently confirmed here.
3. Create a **new private Bucket**, e.g. `m97j/archive-activity`. Do not reuse the public image Bucket or `archive-private-data` backup Dataset. Private storage allowance is shared with other PRO storage, not a new allowance per Bucket. Review total usage and potential overage.
4. Create a fine-grained token scoped only to this Bucket. Set `ACTIVITY_HF_HUB_TOKEN` on Vercel for authenticated metadata/private verification. Generate the corresponding S3 credentials and set `ACTIVITY_HF_S3_ACCESS_KEY_ID` (HFAK…) and `ACTIVITY_HF_S3_SECRET_ACCESS_KEY`. The SDK endpoint is fixed to `https://s3.hf.co/<namespace>`, `us-east-1`, path-style, and required-only checksums. Anonymous 404 alone is not a privacy check.
5. Set the five distinct server-only random values in `apps/web/.env.example`: cookie signing, session encryption, deletion HMAC, raw encryption and `CRON_SECRET`. Each is 32 random bytes represented by 64 hex characters. Do not reuse `OUTBOX_WEBHOOK_SECRET`; do not paste any value into chat. Generate/manage them privately in a trusted password/secrets manager. Retain the raw encryption and deletion-verifier keys securely for the applicable retention/deletion period. Rotating them blindly can make earlier data unreadable or old deletion capabilities unresolvable; a reviewed versioned-key migration is required first.
6. Set the GitHub secret `ARCHIVE_ACTIVITY_MAINTENANCE_SECRET` to the same value as Vercel's dedicated `CRON_SECRET`. The optional GitHub variable `ARCHIVE_PUBLIC_SITE_URL` is the exact production origin, presently `https://marchivej.vercel.app`. The runner never receives HF Bucket keys. No web API or GitHub secret is auto-populated by this source change.
7. Keep all three activation flags false. After deploying the endpoints, run the readiness command with the maintenance secret supplied via your local secure environment: `node apps/web/scripts/activity-maintenance.mjs`, or manually dispatch the retention workflow with `apply=false` (the default). Both perform authenticated GET only and must show `privateVerified: true`. Then dispatch with `apply=true` or run `node apps/web/scripts/activity-maintenance.mjs --apply`; it deletes only expired/tombstoned objects in the owned prefix and bootstraps the heartbeat. Never run it against an unrelated Bucket. Scheduled hourly runs apply cleanup; a read-only readiness check alone does not refresh the heartbeat.
8. Verify hourly scheduling and failure alerts actually operate; a workflow file alone is not proof. Configure platform edge/WAF limits for preference/session/telemetry/recovery/delete routes. The application has bounded bodies, a per-instance global brake and conditional per-session slots, but does not claim a distributed global/IP abuse limiter. Load-test private verification and real S3 conditional writes/listing/deletion before accepting public traffic.
9. With synthetic consented sessions, verify refusal generates no activity request/identifier, purpose separation, visible-only timing, idle expiry, capability recovery, old/current session deletion, retries/races, physical expiry and stopping capture after a stale scheduler heartbeat. Do not use existing visitor data for this acceptance test.
10. Only after these checks set `ACTIVITY_POLICY_REVIEWED=true`, `ACTIVITY_RETENTION_SCHEDULER_REVIEWED=true` and finally `ACTIVITY_COLLECTION_ENABLED=true`. Roll back by disabling capture; keep deletion and cleanup running until all retained data reaches its deadline or is erased.

No live Bucket, contract, scheduler, credentials or visitor data has been tested by the local implementation's synthetic tests. Activation is an explicit subsequent operation.

## CDN pre-warming is optional

For this activity-log Bucket, leave CDN pre-warming unselected. HF describes it as
optional regional caching near the cloud compute that repeatedly reads large files,
such as training datasets and checkpoints. Small encrypted activity batches and
retention/deletion operations do not currently justify choosing a cache region.
Not selecting a region does not disable Bucket access or make it public.

The four UI choices (GCP US East/South Carolina, GCP EU West/Netherlands,
AWS US East/Virginia and AWS EU West/Ireland) are cache locations, not a selection
of where Vercel runs. If a future training workload benefits from pre-warming,
choose the provider/region of that reader after reviewing actual performance and
processing locations. A CDN cache region is not proof of exclusive data residency,
a processing agreement, or erasure guarantees. Do not change the SDK's required
`us-east-1` signing region merely to match a selected CDN location.

See [HF's optional pre-warming documentation](https://huggingface.co/docs/hub/storage-buckets#pre-warming-and-cdn).

Adding Production environment variables in Vercel affects the next Production
deployment, not an already running deployment. Deploy the reviewed activity code
with collection disabled before checking the live maintenance endpoint. Redeploying
an older commit that does not contain these routes does not install this feature.
See [Vercel environment scopes](https://vercel.com/docs/environment-variables#environments).

## Scheduled command

The repository includes an hourly/manual workflow using this bounded runner:

```text
ARCHIVE_ACTIVITY_SITE_URL=https://marchivej.vercel.app
ARCHIVE_ACTIVITY_MAINTENANCE_SECRET=<the private value matching CRON_SECRET>
node apps/web/scripts/activity-maintenance.mjs --apply
```

Without `--apply`, the runner is read-only. `--allow-local` permits an explicit localhost test origin; production origin validation otherwise rejects redirects or arbitrary external hosts. Requests have a 55-second deadline, runs have an eight-minute deadline and a 1,000-page bound. Only aggregate counts/status are printed—not capabilities, cursors, provider responses or credentials. A run that reaches a bound is a failure, not successful expiry. Investigate sizing rather than bypassing its bounds.

For an explicitly authorized synthetic storage test, dispatch with `verify_storage=true`
and `apply=false`, or pass `--verify-storage` to the runner. This is **not read-only**:
the protected server checks private metadata, conditional writes, listing, deletion
and both purpose lifetimes using fresh random test subjects. Only its own synthetic
objects are erased. All three activation flags must be exactly `false`, and the
target must be `m97j/archive-activity`. Requests in this mode have a 110-second deadline.
Expiry uses an isolated simulated clock; it does not prove that 90 real days have
elapsed, does not advance the real namespace clock and does not refresh the real
cleanup heartbeat. A real full sweep and an observed successful scheduled run are
separate acceptance checks. No visitor data is used and this mode cannot enable capture.

## Official references

- [HF Bucket S3 compatibility](https://huggingface.co/docs/hub/storage-buckets-s3): conditional PUT, ListObjectsV2 and unsupported metadata/lifecycle/versioning features.
- [HF public OpenAPI specification](https://huggingface.co/.well-known/openapi.json): authenticated `/api/buckets/{namespace}/{repo}` metadata and private field.
- [HF Bucket security](https://huggingface.co/docs/hub/storage-buckets-security), [storage regions](https://huggingface.co/docs/hub/storage-regions), [shared storage limits](https://huggingface.co/docs/hub/storage-limits).

These implementation references do not establish account-specific legal compliance.

## Local reading-layout review

The loopback fixture includes ten author-written example documents (five kinds in Korean and
English). They are layout examples, not published content or measured research results. Run
`node apps/web/tests/e2e/start-ui-server.mjs` after building the workspace packages, then open:

- `http://127.0.0.1:3010/ko/examples/research/hybrid-retrieval`: math, code, table and Mermaid.
- `http://127.0.0.1:3010/ko/examples/research/representation-learning`: research questions and callouts.
- `http://127.0.0.1:3010/ko/examples/work/archive-architecture`: project architecture and a demo embed.
- `http://127.0.0.1:3010/ko/examples/docs/content-pipeline`: technical instructions and a video embed.
- `http://127.0.0.1:3010/ko/examples/logs/evaluation-notes`: shorter evaluation notes.

The fixture disables collection and replaces the API with loopback-only synthetic records.
It does not connect to Supabase or mutate production documents. Automated browser checks block
external media requests; opening embedded media manually has separate provider processing.
Stop the fixture with Ctrl+C when finished. Dev builds use `.next-preview`, separate from the
production `.next` build. `ARCHIVE_BUILD_WORKERS=1` optionally bounds local build concurrency
on memory-constrained machines; production defaults remain unchanged.

Content-derived related cards are implemented with public metadata/tags and editorial links,
cached separately from immutable document HTML. Publication invalidation updates that cache;
private/session data never enter it. Embedding ranking, approved reading-transition aggregates,
personalizing models, role inference, anomaly-triggered prompts and split-view explanations are
not connected yet. Their UI states are explicitly empty rather than populated with invented data.
The optional end-of-reading hint is a reader-controlled, non-modal shortcut to existing related
documents, not an inferred assessment of difficulty. It does not take keyboard focus; Escape or
an outside click suppresses it for the tab, and the off preference persists on that device.
