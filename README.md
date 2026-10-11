# Archive

`Archive` is a multilingual research archive, engineering portfolio, and evidence-backed
publishing system. Anonymous visitors receive a document-first public site; the owner uses a
Supabase-authenticated admin workspace for authoring, taxonomy, review, compilation, and
publication.

## Architecture

- **Web:** Next.js on Vercel ([marchivej.vercel.app](https://marchivej.vercel.app))
- **Core:** Fastify API and compilation/outbox worker in a private Hugging Face Docker Space
- **Data/Auth:** Supabase PostgreSQL and Auth
- **Media:** Imgur inline images, with an optional Cloudflare R2 presigned-upload adapter
- **Private recovery data:** Encrypted backups in a private HF dataset; keys stored separately
- **Content:** Markdown compiled into sanitized HTML with code, math, Mermaid, YouTube, images,
  and sandboxed Hugging Face demos

The source is a pnpm/Turborepo monorepo. `apps/web` is public-facing and contains the protected
owner console; `apps/api` is the authorization and domain boundary; `apps/worker` handles durable
background compilation and publication events.

## Repository layout

- `apps/web` — public pages and the authenticated owner workspace
- `apps/api` — authorization, content workflows, and media upload tickets
- `apps/worker` — compilation jobs and publication/cache notifications
- `packages/contracts` — shared request, response, and event schemas
- `packages/db` — PostgreSQL schema, queries, and preservation/migration tools
- `packages/content-engine` — Markdown parsing, rendering, and sanitization
- `packages/observability` — shared structured logging
- `supabase` — canonical SQL migrations and local database configuration
- `infra` — deployment assets, optional R2 IaC, and preserved Azure infrastructure
- `docs` — architecture, operations, and bilingual static fallback portfolio

Application-specific UI stays in `apps/web`; shared packages exist only where there is an
implemented cross-application boundary. Empty future modules are not required for extensibility.

## Owner access

Open `/login` or `/admin` on the public site. These shortcuts redirect to the default locale;
the Korean login and workspace paths are `/ko/admin/login` and `/ko/admin`.

Sign in with the email and password of the owner's **Supabase Auth user** whose trusted
`app_metadata.roles` includes `archive_admin`. This is not the Supabase dashboard account,
Vercel account, PostgreSQL database password, or an API key. There is no public sign-up UI;
hosted Supabase sign-up was confirmed disabled by the owner on 2026-10-11.

Knowing a login URL does not grant access or identify a trusted device. Both the Web server
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
- [Cost-driven Azure to PaaS decision](docs/decisions/0001-cost-optimized-paas.md)
- [Historical Azure IaC](infra/legacy/azure/README.md)
- [Historical GitHub Actions](.github/workflow-archive/azure/README.md)
