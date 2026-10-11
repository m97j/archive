# ADR 0001: Cost-optimized PaaS deployment

- Status: accepted
- Context date: 2026-09
- Updated: 2026-10-11

## Context

The first production architecture used Azure App Service, Container Registry, PostgreSQL Flexible
Server, Blob Storage, Key Vault, VNet integration, private endpoints, private DNS, managed
identities, and IP access restrictions. It demonstrated a security-conscious IaC and CI/CD
pipeline but consumed roughly USD 7 per day, which was not sustainable for an always-available
personal archive under a yearly student credit.

The product still needs a public, mostly document-oriented frontend plus authenticated dynamic
authoring, CRUD, taxonomy, multilingual publication, background compilation, rich embeds, and
future AI translation/search.

## Decision

Use a composed PaaS architecture:

- Vercel for the always-available public Next.js frontend and owner console.
- Supabase for managed PostgreSQL and Auth.
- A private Hugging Face Docker Space for the API and worker runtime, accessed by the Web server
  with a server-only HF gateway token and independent administrator JWT authorization.
- Imgur inline images as the primary document media source; retain the optional Cloudflare R2
  adapter for direct presigned uploads and future production media delivery.
- Native platform secret stores and TLS instead of recreating VNet, private DNS, Key Vault, and
  managed ingress controls.

## Consequences

This lowers fixed cost and operational load while retaining clear authorization and secret
boundaries. It trades private networking and unified Azure governance for vendor-specific PaaS
controls, public HTTPS service boundaries, and more explicit application-level authentication.

The 2026-10-11 revision replaces the initial protected-Space choice: protected visibility hides
source but leaves the running app public. Private visibility supplies an authenticated HF gateway,
not a private network or a substitute for the application's own administrator authorization.
R2 remains an optional integration rather than a first-release dependency.

The historical Azure implementation remains under `infra/legacy/azure` and
`.github/workflow-archive/azure` as portfolio evidence. It is intentionally not an active
deployment path for the current monorepo.
