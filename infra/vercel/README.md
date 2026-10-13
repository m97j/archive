# Vercel Web deployment

Deploy `apps/web` as the reader-only public site. Authoring runs in the private HF CMS.

`apps/web/vercel.json` pins pnpm 11.25.0 explicitly for installation and build and builds workspace
dependencies before Next.js. This avoids depending on Vercel's default package-manager selection
when custom install commands are used; no additional Corepack dashboard flag is required.

## Project settings

- Team: `mjs-projects-a33dd953`
- Recommended project name: `marchivej`
- Production domain: `marchivej.vercel.app`
- Git repository: `m97j/archive`
- Production branch: `main`
- Framework preset: Next.js
- Root Directory: `apps/web`
- Node.js: 24.x

Vercel detects the repository-root `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and pinned package
manager when deploying a workspace application. Keep the Root Directory's automatic inclusion of
files outside that directory enabled because `apps/web` depends on packages in `packages/`.

The checked-in Web build uses Webpack because the current local Windows validation environment
cannot reliably complete the Turbopack production build. Do not override the package build command
unless the deployment proves that an override is necessary.

## Deployment authentication

The existing Vercel GitHub integration deploys the `main` production branch without a local
`vercel login` session or a Vercel CLI token in GitHub Actions. CLI authentication is needed only
for separate CLI/API administration, not for this deployment path.

Public `/login`, `/admin` and their localized management paths return 404. The private
HF CMS uses the owner's Supabase Auth account and independently verified `archive_admin` role.
Vercel CLI login is still unnecessary for the existing main-branch Git deployment.

Real administrator API authoring/publication, deployed cache update/removal, and browser Server
Action checks passed. Password login-form and session-refresh checks remain unverified; see
[owner login and device access](../../docs/operations/deployment-readiness.md#owner-login-and-device-access).

## Environment variables

Set these in Production and use separate values for Preview where an isolated backend is
available:

| Key                                 | Production value                              |
| ----------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`              | `https://marchivej.vercel.app`                |
| `NEXT_PUBLIC_DEFAULT_LOCALE`        | `ko`                                          |
| `NEXT_PUBLIC_SUPPORTED_LOCALES`     | `en,ko,ja,zh,es,fr,de`                        |
| `ARCHIVE_API_BASE_URL`              | `https://m97j-archive-core.hf.space`          |
| `ARCHIVE_API_UPSTREAM_BEARER_TOKEN` | Server-only HF token for the private Space    |
| `OUTBOX_WEBHOOK_SECRET`             | Same long random value as the HF Space worker |

`archive-core` is private as of the approved 2026-10-11 runtime validation. The upstream token
is required for its HF gateway and never belongs in `NEXT_PUBLIC_*` or browser code.
The reader-only app does not initialize Supabase Auth or expose owner mutation routes.
Old integration-created keys are unused here; review other consumers before removing them.
Do not set `ARCHIVE_DEV_ADMIN_ACCESS_TOKEN` in any Vercel environment.

Vercel variables affect only deployments created after the change, so redeploy after editing
them. Secrets belong in Project Settings, not in `vercel.json` or Git.

Do not treat successful environment setup or a Docker build as successful publication/CRUD deployment.
See the [current deployment boundary](../../docs/operations/deployment-readiness.md).
