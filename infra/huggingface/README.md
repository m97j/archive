# Private Hugging Face Space

## Verified decision — 2026-10-11

Keep Vercel + private Docker CPU `archive-core` + Supabase. Connectivity was verified inside
the HF runtime:

| Supabase route           | Drizzle/pg    | Drizzle/Postgres.js | Prisma/pg     | Kysely/pg     |
| ------------------------ | ------------- | ------------------- | ------------- | ------------- |
| Session pooler, 5432     | PASS          | PASS                | PASS          | PASS          |
| Transaction pooler, 6543 | PASS          | PASS                | PASS          | PASS          |
| Direct, 5432             | Network error | Network error       | Network error | Network error |

Each PASS verified certificates/hostnames and a real read-only transaction. Bare `pg` also
passed both poolers. Prisma used 7.10.0 with its pg adapter; Kysely is a typed SQL builder.
The old Express/Prisma 5 app also served a real DB read before replacement. These are
connectivity tests, NOT a CRUD/load benchmark.

Choose **Drizzle 0.45.2 + pg 8.23.0 + Session pooler** for the persistent API/worker.
It preserves PostgreSQL transactions, transaction advisory locks, queue claims, JSONB and
full-text search. HTTPS/RPC was not needed or adopted. [HF's published networking policy](https://huggingface.co/docs/hub/en/spaces-overview#networking)
still lists outbound ports 80/443/8080 only; the observed behavior differs. Do not promise this
exception in every future runtime. Rerun the isolated connectivity probe when changing runtimes.

## Production migration and preservation

The application backup was restore-tested in disposable PostgreSQL 17 before migration.
All original rows matched, including 22 legacy posts. Original tables and HF source history
are retained. Do not blindly restore the old Dockerfile: its startup ran Prisma migrations.
The initial seven-migration Drizzle history (`0000` through `0006`) was applied. Migration
`0006_server_only_access.sql` enables RLS for all 26 Archive tables and the existing legacy
tables and revokes direct access from `anon`, `authenticated` and `PUBLIC`.
All 30 production public tables now have RLS. Original rows remain unchanged; 22 posts were
copied with exact Markdown and metadata into private drafts in the new schema, without auto-publication.
No permissive RLS policy is installed: content access goes through the trusted API.
The current database owner can serve it; a future non-owner runtime role needs explicit
scoped grants/policies. Owners/BYPASSRLS identities are not restricted by RLS itself.

Migration `0007_fixed_function_search_path.sql` adds function-search-path hardening without
modifying rows; production application remains pending the guarded backup/migration workflow.
Real administrator API creation, revision, approval, compilation, publication and reversible
archive/restore checks passed on 2026-10-11. New Web release cache and browser session checks
remain separate gates, not consequences of a successful API or Docker health check.

The legacy **Variable name** `AZURE_STORAGE_KEY` was observed, without printing the value.
If real, revoke/rotate it and remove it from Variables. Needed replacements belong in Secrets;
private conversion cannot undo past credential disclosure. A health response is not DB/CRUD
readiness. See [deployment readiness](../../docs/operations/deployment-readiness.md).

## TLS and connections

API, worker and migration client share certificate-verifying TLS and bounded pools.
The public Supabase Root 2021 CA is packaged with `@archive/db`, not entered as a secret.
It matches the user's dashboard-downloaded certificate. DER SHA-256:
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`; expires 2031-04-26.

Optional settings (no new mandatory secret is needed):

- `DATABASE_SSL_MODE`: omitted => `verify-full` remotely, `disable` on localhost.
  Remote bypasses are rejected; never use `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `DATABASE_SSL_CA`: a newly trusted public CA PEM, with literal newlines or escaped `\n`,
  OR `DATABASE_SSL_CA_FILE`: its container path. Set at most one, never a private key.
- `DATABASE_POOL_MAX`: 4 per process (API + worker = at most 8 connections).
- `DATABASE_CONNECT_TIMEOUT_MS`: 10000; `DATABASE_IDLE_TIMEOUT_MS`: 30000;
  `DATABASE_STATEMENT_TIMEOUT_MS`: 15000; `DATABASE_QUERY_TIMEOUT_MS`: 20000.

URL SSL options are normalized so they cannot overwrite the explicit CA/verification policy.
Encoded passwords are preserved. Other database providers use system trust unless a custom
public CA is configured. Rotate/update the bundled public trust root when Supabase requires it.

## Configuration contract

Enter runtime credentials only in platform Secrets, never in source or chat.

| Key                                                     | Destination/value role                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                                          | HF Secret: Session pooler URL with encoded database password             |
| `SUPABASE_JWKS_URL`                                     | `https://spffrdgttkhlwgosuvix.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER`                                   | `https://spffrdgttkhlwgosuvix.supabase.co/auth/v1`                       |
| `SUPABASE_JWT_AUDIENCE`                                 | `authenticated`                                                          |
| `PUBLISHER_ROLE`                                        | `archive_admin`                                                          |
| `PUBLICATION_WEBHOOK_URL`                               | `https://marchivej.vercel.app/api/revalidate`                            |
| `OUTBOX_WEBHOOK_SECRET`                                 | HF Secret: same random value as Vercel                                   |
| `OUTBOX_BATCH_SIZE`                                     | Optional: 20                                                             |
| `OUTBOX_POLL_MILLISECONDS`                              | Optional: 1000                                                           |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | Optional R2 configuration                                                |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`              | Optional bucket-scoped HF Secrets                                        |

Omit all R2 fields while using Imgur; enable all five together if using the adapter.
Browsers can upload through presigned S3 URLs and read public images directly; no Vercel
image rewrite is necessary. `r2.dev` remains a development read origin, not a production CDN.

Vercel requires `ARCHIVE_API_BASE_URL=https://m97j-archive-core.hf.space` and server-only
`ARCHIVE_API_UPSTREAM_BEARER_TOKEN`. Its HF token authenticates the gateway; admin requests
also carry a separate Supabase user JWT, with `app_metadata.roles` verified by the API.
Gateway access is not private networking, and an HF token is not an administrator credential.

## Build and runtime availability

The workflow assembles a root Docker build context and refuses to sync to a non-private Space.
Runtime secrets never belong in that context. With the current non-injected workspace lockfile,
pnpm packaging uses explicit `deploy --legacy`. Local package checks confirmed the CA is
included in both API and worker deployment packages. The full application Docker image
is verified independently from schema migration. A successful build or health check alone does
not establish authenticated authoring/publication/cache-invalidation correctness.

CPU Basic sleep/wake behavior is an accepted tradeoff, not a reason to change platforms.
Cached pages can remain available; uncached requests may wait for HF/DB. Keep a durable
read-only published-content fallback. No paid compute or ZeroGPU change was provisioned.

The local API also enables Helmet security headers, 600 requests/minute per socket peer,
30-second request/connection deadlines, proper 400/413/429 responses, credential-header
redaction and sanitized SQL-error logging. Arbitrary forwarded-IP headers are not trusted.
This limiter is in-memory per process and coarse behind the HF/Vercel gateway; it is not
a distributed per-user quota, a DDoS guarantee or a replacement for platform protections.
Validate these guards again against the released application.

## Probe and research boundary

`connection-probe` is an isolated pinned npm project, not an application dependency.
It reads existing HF Secrets, never logs URLs/passwords/keys/JWTs, runs read-only SQL and
stops without retrying an authentication/circuit-breaker failure. `GET /report` is protected
by private HF gateway authorization; only status/security metadata is returned. It reruns
on restart and must not become the permanent business application.

`probe.test.mjs` checks URL/error/read-only safety. `migrations.test.mjs` applies all migrations
in disposable local PGlite, preserves synthetic legacy rows and verifies browser roles cannot
read/write server-only tables. That is not a production migration or a Supabase integration test.

Public `knowledge-engine` remains unchanged. Large training runs on Colab/Vast/Runpod;
the separate public service hosts inference, APIs and demos. Current ZeroGPU requires Gradio,
so Docker/Python 3.11 is not converted by a hardware toggle alone. Retrieval, translation and
recommendation may share one serving Space but keep research evaluation/model/index versions
and private user data separated. See the research notes in the deployment-readiness document.
