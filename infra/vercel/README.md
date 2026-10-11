# Vercel Web deployment

Deploy `apps/web` as the public site and authenticated administration interface.

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

Administrator login is independent: `/login` redirects to `/ko/admin/login` with the current
default locale, and `/admin` redirects to `/ko/admin`. It uses the email/password of the owner's
Supabase Auth user with the verified `archive_admin` role, not the Vercel account, Supabase
dashboard account, or PostgreSQL database password. There is no sign-up interface; the owner
confirmed hosted public sign-up disabled on 2026-10-11.

Real administrator API authoring/publication checks passed separately. Browser login-form,
session-refresh, and new-release cache validation remain pending; see
[owner login and device access](../../docs/operations/deployment-readiness.md#owner-login-and-device-access).

## Environment variables

Set these in Production and use separate values for Preview where an isolated backend is
available:

| Key                                    | Production value                              |
| -------------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | `https://marchivej.vercel.app`                |
| `NEXT_PUBLIC_DEFAULT_LOCALE`           | `ko`                                          |
| `NEXT_PUBLIC_SUPPORTED_LOCALES`        | `en,ko,ja,zh,es,fr,de`                        |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://spffrdgttkhlwgosuvix.supabase.co`    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                      |
| `ARCHIVE_API_BASE_URL`                 | `https://m97j-archive-core.hf.space`          |
| `ARCHIVE_API_UPSTREAM_BEARER_TOKEN`    | Server-only HF token for the private Space    |
| `OUTBOX_WEBHOOK_SECRET`                | Same long random value as the HF Space worker |

`archive-core` is private as of the approved 2026-10-11 runtime validation. The upstream token
is required for its HF gateway and never belongs in `NEXT_PUBLIC_*` or browser code.
The user's Supabase JWT is forwarded separately for administrator authorization. Do not set
`ARCHIVE_DEV_ADMIN_ACCESS_TOKEN` in any Vercel environment.

Vercel variables affect only deployments created after the change, so redeploy after editing
them. Secrets belong in Project Settings, not in `vercel.json` or Git.

Do not treat successful environment setup or a Docker build as successful publication/CRUD deployment.
See the [current deployment boundary](../../docs/operations/deployment-readiness.md).
