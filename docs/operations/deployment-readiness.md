# Deployment readiness

> **2026-10-11 measured decision:** Keep Vercel + private HF archive-core + Supabase,
> using **Drizzle + pg + Session pooler**. Connectivity was verified inside the HF runtime
> rather than inferred from the published networking policy. Production schema and
> preservation checks passed; the API/worker release and Web smoke test are tracked separately.

## Current verified state

archive-core is private. Original application source remains in HF Git history.
Do not restore its historical Dockerfile blindly: startup automatically ran Prisma migrations.

Session (5432) and Transaction (6543) poolers passed certificate verification and read-only
transactions with pg, Drizzle/pg, Drizzle/Postgres.js, Prisma/pg and Kysely/pg. Direct access
failed with `ENETUNREACH`: DNS returned only IPv6 addresses and the Space had no route to them.
Both Direct and Session use port 5432, so this is not evidence of a blanket port-5432 block.
These are connectivity checks, NOT full CRUD/load/performance
benchmarks. Prisma 7 and Kysely both used pg; changing ORM does not change the network route.
The persistent worker favors Session mode; no HTTPS/RPC fallback or platform change was needed.

Before migration the database had four legacy tables without RLS. A consistent application
backup was restored in a separate PostgreSQL 17 instance and every row fingerprint matched.
The backup is preserved locally and encrypted in private `m97j/archive-private-data`.
The initial seven Drizzle migrations (`0000` through `0006`) were then applied. Migration
`0006_server_only_access.sql` enables RLS on new/legacy tables and revokes direct access from
`anon`, `authenticated` and `PUBLIC`.
No permissive RLS policies are installed: readers/admins use the trusted business API.
All 30 production public tables now have RLS enabled; the original 22 posts and migration
history were preserved unchanged. All 22 posts were copied into the new schema as private
drafts, retaining exact Markdown and original metadata; none were automatically published.
The database owner can still serve the app;
a future non-owner least-privilege runtime role needs explicit grants/policies. Owners and
BYPASSRLS identities are not restricted by RLS itself.

The real API/worker Docker release runs successfully: health and public PostgreSQL reads passed,
unauthenticated gateway access was denied, and missing/invalid admin user JWTs were rejected.
On 2026-10-11, authenticated administrator API checks passed for content creation, two revision
cycles, review/approval, compilation, publication, public resolution, and reversible archive/restore.
The original 22 migrated drafts retained their exact fingerprints. Vercel rendered the first test
revision, but the previous Web deployment failed subsequent cache-update/removal checks. The new
locale-tag invalidation fix passed local production-mode tests; deployed cache verification and
browser login-form/session-refresh checks remain separate release gates.
The name `AZURE_STORAGE_KEY` was observed among legacy HF Variables, without printing
its value. If real, revoke/rotate it and remove it from Variables; needed replacements belong
in Secrets. Private conversion cannot undo a previous credential disclosure.

API and worker now share certificate-verifying TLS, small pools and finite query timeouts.
The trusted public Supabase CA is included in deployment packages, so no new required secret
is necessary. See [the runbook](../../infra/huggingface/README.md).
The comparison dependencies remain isolated. The release also updates security-patched
Next.js/Fastify and rendering dependencies; production dependency advisories are checked in CI.
Verification used Node 24; default Windows Node 22.11.0 is below the declared workspace runtime.
Recheck official dependency security advisories before final production release.

[HF's published networking policy](https://huggingface.co/docs/hub/en/spaces-overview#networking)
still lists outbound 80/443/8080 only; this Space's measured result differs. Retest on rebuilds
or runtime moves rather than claiming a universally supported exception. If SQL stops working,
a HTTPS/RPC implementation must preserve atomic revision/publication/job/outbox operations;
independent REST calls are not an equivalent replacement for a transaction.

## Implementation and release verification

The application implements authenticated authoring, append-only editing, reversible archive/restore,
publication, compilation-worker, public rendering and signed cache invalidation. Archiving retains
source, revision history and publication rows while removing the record from public resolution,
catalogs and navigation. Access changes emit cache-invalidation events just like publication.
No production credential belongs in Git.

The administrator has completed a real Supabase Auth sign-in for the API checks, including
publication. Browser form submission, refreshed-cookie behavior, and cache update/removal checks
against the new Web release remain pending. Test doubles and an isolated PostgreSQL-compatible
database supplement those checks but do not replace them. Public cache invalidation is asynchronous; it cannot retract a
page already downloaded by a visitor or force an already open tab to refresh.

## Owner login and device access

- `/login` redirects to the default locale's login page; `/admin` redirects to its workspace.
  With the current Korean default, these are `/ko/admin/login` and `/ko/admin`. An unauthenticated
  workspace request redirects to the login page. Public navigation does not advertise owner links.
- Login requires the email and password of a **Supabase Auth user**. It is not the Supabase
  dashboard login, Vercel login, PostgreSQL database password, or a publishable/secret API key.
  The verified provider-controlled claims must include `archive_admin`, normally in
  `app_metadata.roles`; editable `user_metadata` cannot grant administrator access.
- There is no sign-up UI or sign-up action. The owner confirmed hosted Supabase public sign-up
  was switched off on 2026-10-11. Local `supabase/config.toml` also disables email and anonymous
  sign-up; local configuration alone would not change a hosted project's Auth settings.
- The Web server checks signed administrator claims and the core API independently verifies the
  JWT signature, issuer, audience, and required role. The private HF gateway token authenticates
  the Web server to the Space; it does not grant a visitor an administrator identity.
- The server-only Auth flow uses `HttpOnly`, `SameSite=Lax` cookies and `Secure` cookies in
  production. Administrator responses are non-cacheable, excluded from indexing, and protected
  against framing. These controls do not make a login URL private or prove device ownership.
- Sign-out clears the current device's session without signing out other devices. An already
  issued access JWT can remain valid until expiry; local sign-out is not global token revocation.
  See [Supabase sign-out semantics](https://supabase.com/docs/reference/javascript/auth-signout).

The owner can log in separately on a desktop, laptop, or phone. Neither the URL nor a remembered
browser identifies an approved physical device. A device-only login page would require a separate
access gateway and registered-device/access policy; it is not implemented in this release.
IP allowlists alone are a poor fit for mobile networks and changing home addresses.

Supabase [Basic MFA is included on Free](https://supabase.com/pricing). TOTP enrollment, challenge,
verification, recovery handling, and `aal2` enforcement in both the Web and API are a planned
hardening step, not an enabled control. Enrolling a factor alone does not enforce MFA on writes;
see [the MFA guide](https://supabase.com/docs/guides/auth/auth-mfa). Do not claim this release has
MFA or trusted-device enforcement until those paths are implemented and tested.

## Intended deployment topology

| Component       | Target                        | Publicly reachable      | Notes                                                    |
| --------------- | ----------------------------- | ----------------------- | -------------------------------------------------------- |
| `apps/web`      | Vercel                        | Yes                     | Next.js frontend and signed `/api/revalidate` endpoint   |
| `apps/api`      | Private Hugging Face Space    | HF-authorized only      | HF gateway token plus independent admin user JWT         |
| `apps/worker`   | Same private Docker CPU Space | No inbound worker port  | Polls PostgreSQL jobs/outbox and calls the Web webhook   |
| PostgreSQL/Auth | Supabase                      | Platform endpoints only | Migrations live in `supabase/migrations`                 |
| Media           | Imgur; optional Cloudflare R2 | Public image reads      | R2 presigned uploads; S3 credentials remain in the Space |

The initial `m97j/archive-core` Docker Space runs the API and worker under the included process
supervisor. Split them later only when independent scaling or failure isolation becomes useful.

## Confirmed deployment identifiers

- HF Space page: `https://huggingface.co/spaces/m97j/archive-core`
- HF runtime/API base: `https://m97j-archive-core.hf.space`
- Cloudflare account ID: `a604ebdf46c7c0f3945cb5c3b833bad2`
- R2 bucket: `archive-image`
- Optional R2 development read origin: `https://pub-d5bba009e2e54e8ea7cd4aff16c9eec4.r2.dev`
- R2 S3 endpoint: `https://a604ebdf46c7c0f3945cb5c3b833bad2.r2.cloudflarestorage.com`

The S3 URL shown in the Cloudflare bucket settings may include `/archive-image`; application code
must still configure the account-level endpoint and pass `archive-image` as the SDK bucket name.
The checked-in storage client already follows this form.

Secret inventory (the user reports completing required settings; R2 remains optional):

- Supabase pooled database connection string
- Bucket-scoped R2 access key ID and secret access key
- Supabase publishable key
- Shared outbox webhook secret

Supply secrets through each platform's secret store or GitHub Actions secrets, never in chat
or committed files. Token values should be entered directly into the destination platform
whenever possible.

## One-time administrator role bootstrap

Use the existing account UUID from **Authentication > Users**, its expected email, and a
Supabase server **secret key** (`sb_secret_...`; the legacy `service_role` key is also accepted).
A publishable/anon key cannot administer users. This key is needed only for bootstrap, not by
the browser or the normal JWT-verifying API. Do not add it to a `NEXT_PUBLIC_*` setting.

From a local PowerShell 7 terminal at the repository root, after workspace dependencies are
installed, first run a read-only check:

```powershell
pwsh -NoProfile -File .\apps\web\scripts\grant-admin.ps1
```

Then repeat with explicit write authorization:

```powershell
pwsh -NoProfile -File .\apps\web\scripts\grant-admin.ps1 -Apply
```

The key is entered in a hidden prompt and passed only to the short-lived Node child process.
It is not written to a file, command arguments, shell history, or the parent environment. Like
all such setup tools, it temporarily holds the key in process memory; use only a trusted local
machine. The tool verifies both UUID and email, preserves existing app metadata and roles,
and appends `archive_admin` idempotently. Coordinate this one-time operation so another admin
is not editing the same user's metadata concurrently. Avoid sharing terminal transcripts.

After applying, sign out and sign in again: existing JWTs do not acquire the new claim simply
because the account record changed. The script does not print a JWT, change a password, rotate
signing keys, apply database migrations, or fix RLS. Optionally create a separate bootstrap
secret key and delete it afterward, without revoking keys used by existing integrations.

References: [Admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid),
[server secret keys](https://supabase.com/docs/guides/getting-started/api-keys).

The GitHub `Production` environment needs `HF_TOKEN` for Space sync and
`ARCHIVE_DATABASE_URL`, `ARCHIVE_BACKUP_ENCRYPTION_KEY`, and `HF_DATASET_TOKEN` for the guarded
Drizzle migration workflow. Run it with `apply=false` first; this only verifies migration history.
If `ARCHIVE_DATABASE_URL` is absent, the workflow can construct the measured Session pooler
URL from the existing `POSTGRES_PASSWORD` secret; this value must be the database password.
Plan failures report a sanitized authentication/network/TLS status, never a raw PostgreSQL error
or password. If credentials are rejected, update the GitHub production secret through its secure
settings interface rather than extracting another platform's runtime secrets or bypassing TLS.
Do not enable a second production migration path via Supabase native GitHub integration.
See [backup and private research data](private-data.md) for key recovery and retention.

Updating a GitHub Secret does not rerun a failed job. In **Actions > Plan or apply verified
database migrations > Run workflow**, choose `main` and leave `apply` unchecked for a read-only
connection/history check. Repository secrets are available to the job, but a same-name
`Production` environment secret takes precedence; update that environment value when present.
This check does not deploy the Web app or publish content. Vercel's existing GitHub integration
does not require local CLI login; administrator smoke tests use a separate Supabase Auth session.

## Security Advisor follow-up

Migration `0007_fixed_function_search_path.sql` pins an empty `search_path` for the three Archive
trigger functions. Their bodies use only PostgreSQL built-ins and trigger rows; they do not
resolve application tables or custom types. This is an additive hardening migration, not a
change to already-applied migration files, function bodies, data, or trigger definitions.
Its presence in source does not mean it has been applied to production: use the guarded backup
and migration workflow and recheck Security Advisor afterward.

The separate **Leaked Password Protection Disabled** warning concerns Supabase Auth passwords,
not RLS, JWKS, or the PostgreSQL connection password. Supabase's
[password security documentation](https://supabase.com/docs/guides/auth/password-security)
limits built-in leaked-password protection to Pro and above. If the project remains Free, this
warning cannot be removed by an Archive SQL migration. Use a unique password-manager-generated
administrator password and review minimum strength requirements. Hosted public sign-up was
confirmed disabled by the owner on 2026-10-11. These settings do not retroactively invalidate
existing passwords.
Enforcing MFA additionally requires an application assurance-level policy; enrolling a factor
alone must not be described as API-side enforcement.

## Runtime environment matrix

### Vercel (`apps/web`)

| Variable                               | Visibility   | Purpose                            |
| -------------------------------------- | ------------ | ---------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | Browser-safe | Canonical public origin            |
| `NEXT_PUBLIC_DEFAULT_LOCALE`           | Browser-safe | Default locale                     |
| `NEXT_PUBLIC_SUPPORTED_LOCALES`        | Browser-safe | Comma-separated locale list        |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser-safe | Supabase project URL               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key           |
| `ARCHIVE_API_BASE_URL`                 | Server-only  | Private Space API base URL         |
| `ARCHIVE_API_UPSTREAM_BEARER_TOKEN`    | Secret       | Required private HF gateway token  |
| `OUTBOX_WEBHOOK_SECRET`                | Secret       | Verifies worker publication events |

Do not configure `ARCHIVE_DEV_ADMIN_ACCESS_TOKEN` in production.

### Private Hugging Face Space (`apps/api` and `apps/worker`)

Use `apps/api/.env.example` as the authoritative key list. The current Supabase project reference
is `spffrdgttkhlwgosuvix`, derived from `https://spffrdgttkhlwgosuvix.supabase.co`. At minimum
configure the database, Supabase JWKS/issuer/audience, `PUBLISHER_ROLE` and worker webhook.
Omit all R2 fields while using Imgur; configure all five together if using R2. The Space must not expose its database or R2 credentials to the browser.
Before issuing administrator sessions, migrate Supabase Auth to an asymmetric signing key and
confirm the JWKS endpoint returns at least one public key.

### Worker runtime (`apps/worker`)

The worker shares the `archive-core` Space runtime. Set `PUBLICATION_WEBHOOK_URL` to
`https://<vercel-domain>/api/revalidate`, and give `OUTBOX_WEBHOOK_SECRET` exactly the same value
as Vercel.

### R2 URL roles

`R2_PUBLIC_BASE_URL` is the anonymous read origin if R2 is enabled. The supplied `r2.dev` URL
is a development origin, not a recommended production CDN. Imgur inline images remain primary. The account-level `r2.cloudflarestorage.com` endpoint
is authenticated and used only by the S3 client to generate scoped presigned upload URLs. It is
not a public image URL.

No Vercel rewrite is required: browsers upload directly to the presigned S3 URL and read published
objects directly from R2. Configure the bucket CORS rule for localhost and the production Vercel
origin. A custom R2 domain becomes possible only after a domain controlled by the owner is added
to the same Cloudflare account; the `vercel.app` and `hf.space` platform DNS zones cannot be used.

## Deployment order

1. Create the Supabase project, apply migrations, and create an administrator whose trusted
   `app_metadata.roles` contains `archive_admin`.
2. If enabling R2, review/import existing bucket state and configure CORS/read serving;
   skip this while using Imgur.
3. Configure the private `m97j/archive-core` Docker Space secrets, deploy the combined API and
   worker image, and verify `/health` at `https://m97j-archive-core.hf.space/health`.
4. Deploy the Web app to Vercel with the private Space URL; a server-only HF gateway token is required.
5. Create and publish a test revision, then confirm the worker compiles it, publishes the outbox
   event, and Vercel serves the new document without waiting for the normal cache TTL.
6. Only after the smoke test, add custom domains and production DNS.

## Git and automation boundary

The checked-in CI workflow performs install, formatting, type checks, tests, and builds without
deployment credentials. HF deploys main after successful CI, or by manual dispatch. Database
schema changes require a protected manual dispatch with backup gates. Both use the GitHub
`Production` environment. The R2 bucket and CORS policy are represented by Terraform;
management and S3 data credentials remain separate. Add a Terraform apply workflow only after a
durable remote state backend has been selected; an ephemeral Actions runner must not own the only
copy of production state.

On 2026-09-06 the HF health endpoint responded successfully, while the root HTML still referenced
the former Portfolio Core application and `minjae-portfolio.vercel.app`. That image was replaced
by the combined Archive API/worker release on 2026-10-11; the original source remains in HF Git
history. The earlier R2 public-origin root response was `404`, which is expected because R2 public
buckets do not provide a root object listing; validate with an uploaded object URL instead.

## Research and portfolio extension direction

The public knowledge-engine was inspected at `ca57013f7711c76e14c4c4fbd18cd899ee7030ac`.
It currently has FastAPI, BGE-M3 dense+sparse queries, Qdrant RRF, SQLite metadata and optional
BGE reranking. Live OpenAPI exposes `/api/v1/search/`, `/api/v1/search/demo` and
`/api/v1/health/ping`. Standalone embedding, translation, recommendation and multi-vector
retrieval endpoints are not implemented. Its repository/runtime was inspected, not modified.

The extension architecture separates large training on Colab/Vast/Runpod, private Docker CPU
archive-core for business jobs, and a public knowledge-engine for inference/API/demo.
Retrieval, translation and recommendation may share one serving Space, while their source,
data/evaluation/model cards and portfolio documentation remain three separate research projects.
Use external APIs/pretrained baselines first; custom models require measured evaluation, not
an assumption that training from scratch guarantees BGE-M3-level or better quality.

Current [ZeroGPU](https://huggingface.co/docs/hub/en/spaces-zerogpu) requires Gradio. Docker/
Python 3.11 is not converted by a hardware toggle alone; plan a compatible SDK/runtime plus
queued GPU functions. Version independent endpoint/model interfaces, loading budgets and
timeouts; quota and queue behavior remain inference-service constraints.

Before integrating the present engine, fix/test in its own repository:

- BGE lexical-weight keys are already stringified token IDs; `models/embedder.py` wrongly
  re-tokenizes them with `convert_tokens_to_ids`. Convert to integers and compare corpus
  index encoding before deciding whether it needs rebuilding.
- The service constructs `llm_context`, but `SearchResponse` omits it and drops it from JSON.
- Synchronous model work inside the async API needs bounded workers/queues and input limits.
- Wildcard credentialed CORS, raw-query logging and unescaped XML metadata need hardening.
  Retrieved text is untrusted; XML wrapping does not prevent prompt injection.

Version the model, tokenizer, vector schema and corpus/chunking fingerprint together.
Changing a tokenizer changes sparse IDs; changing a model normally requires re-embedding
the corpus. Benchmark multilingual retrieval separately from translating result text.
Preserve Markdown AST/code/math/embed structure and use human review before publication of
AI translation or document/UX edits. Keep raw private drafts and user logs in private storage;
public demos use public/consented or synthetic data and receive only necessary features.

Sources: [inspected engine revision](https://huggingface.co/spaces/m97j/knowledge-engine/tree/ca57013f7711c76e14c4c4fbd18cd899ee7030ac),
[FlagEmbedding 1.3.5 token-ID output](https://github.com/FlagOpen/FlagEmbedding/blob/v1.3.5/FlagEmbedding/inference/embedder/encoder_only/m3.py),
[ZeroGPU](https://huggingface.co/docs/hub/en/spaces-zerogpu).
