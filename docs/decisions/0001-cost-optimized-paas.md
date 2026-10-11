# ADR 0001: Cost-optimized PaaS deployment

- Status: accepted
- Context date: 2026-09

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
- A protected Hugging Face Docker Space for the API and worker runtime.
- Cloudflare R2 for public document media and direct presigned uploads.
- Native platform secret stores and TLS instead of recreating VNet, private DNS, Key Vault, and
  managed ingress controls.

## Consequences

This lowers fixed cost and operational load while retaining clear authorization and secret
boundaries. It trades private networking and unified Azure governance for vendor-specific PaaS
controls, public HTTPS service boundaries, and more explicit application-level authentication.

The historical Azure implementation remains under `infra/legacy/azure` and
`.github/workflow-archive/azure` as portfolio evidence. It is intentionally not an active
deployment path for the current monorepo.
