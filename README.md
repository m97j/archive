# Archive

`Archive` is a multilingual research archive, engineering portfolio, and evidence-backed
publishing system. Anonymous visitors receive a document-first public site; the owner uses a
Supabase-authenticated admin workspace for authoring, review, compilation, and
publication.

## Architecture

- **Web:** Next.js on Vercel ([marchivej.vercel.app](https://marchivej.vercel.app))
- **Core/CMS:** Next.js owner console, Fastify API and durable worker in a private HF Docker Space
- **Inference:** Authenticated embedding/translation APIs on the separate public knowledge-engine
- **Data/Auth:** Supabase PostgreSQL and Auth
- **Media:** Imgur inline images, with an optional Cloudflare R2 presigned-upload adapter
- **Private recovery data:** Encrypted backups in a private HF dataset; keys stored separately
- **Content:** Markdown compiled into sanitized HTML with code, math, Mermaid, YouTube, images,
  and sandboxed Hugging Face demos

The source is a pnpm/Turborepo monorepo. `apps/web` is reader-only; `apps/cms` is the private
owner console; `apps/api` is the authorization and domain boundary; `apps/worker` handles durable
compilation, publication events and external inference jobs.

## Repository layout

- `apps/web` — public reading pages, search and cache notifications
- `apps/cms` — private owner workspace, editing, review and job status
- `apps/api` — authorization, content workflows, and media upload tickets
- `apps/worker` — compilation jobs and publication/cache notifications
- `packages/contracts` — shared request, response, and event schemas
- `packages/db` — PostgreSQL schema, queries, and preservation/migration tools
- `packages/content-engine` — Markdown parsing, rendering, and sanitization
- `packages/observability` — shared structured logging
- `supabase` — canonical SQL migrations and local database configuration
- `infra` — deployment assets, optional R2 IaC, and preserved Azure infrastructure
- `docs` — architecture, operations, and bilingual static fallback portfolio

Application-specific UI stays in its application; shared packages exist only where there is an
implemented cross-application boundary. Empty future modules are not required for extensibility.

## Owner access

Open the private [archive-core Space](https://huggingface.co/spaces/m97j/archive-core).
Its Korean login and workspace paths are `/ko/admin/login` and `/ko/admin`.
The public Vercel site's owner/login routes return 404 and do not contain the CMS implementation.

Sign in with the email and password of the owner's **Supabase Auth user** whose trusted
`app_metadata.roles` includes `archive_admin`. This is not the Supabase dashboard account,
Vercel account, PostgreSQL database password, or an API key. There is no public sign-up UI;
hosted Supabase sign-up was confirmed disabled by the owner on 2026-10-11.

Knowing a login URL does not grant access or identify a trusted device. Both the CMS server
and core API verify administrator claims. See [owner access and security](docs/operations/deployment-readiness.md#owner-login-and-device-access)
for session protections and the boundary between implemented controls and future MFA/device gating.

## Local verification

```text
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Environment templates live beside each application. Never commit real tokens or database
credentials.

Root configuration files pin the workspace/runtime and keep builds, formatting, linting, and
tests reproducible. `.vscode` contains optional shared editor tasks and recommendations, not
personal credentials or machine-specific state. Private operational records, environment files,
build output, and editor caches are excluded from Git.

## Documentation

- [Deployment readiness](docs/operations/deployment-readiness.md)
- [Static fallback portfolio](docs/index.md)
- [Static fallback operations](docs/operations/static-fallback.md)
- [Current platform topology](docs/architecture/platform-topology.md)
- [Private CMS configuration and rollout](docs/operations/private-cms.md)
- [Cost-driven Azure to PaaS decision](docs/decisions/0001-cost-optimized-paas.md)
- [Historical Azure IaC](infra/legacy/azure/README.md)
- [Historical GitHub Actions](.github/workflow-archive/azure/README.md)
