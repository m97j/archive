# Platform topology

## Current deployment target

```text
Public reader ──> Vercel / Next.js ──> private HF Space / Fastify API ──> Supabase PostgreSQL
                        │                            │
                        │                            ├── compilation + outbox worker
                        │                            └── signed R2 upload tickets
                        │
                        ├── Supabase Auth cookies
                        └── public R2/Imgur media URLs
```

The public site and owner console belong in the same Next.js application. This keeps SEO-oriented
documents server-rendered while making authoring, review, taxonomy, and publication available
through an authenticated GUI. The HF Space should be treated as a headless core runtime, not as a
second administration UI.

Recommended names:

- GitHub: `m97j/archive` (already canonical)
- Vercel project: `marchivej` to match `marchivej.vercel.app`; `archive-web` is the clearer
  infrastructure-oriented alternative
- HF Space: `m97j/archive-core`, private visibility
- Supabase display name: `archive-db` or `archive`; renaming the display name does not change the
  existing project reference `spffrdgttkhlwgosuvix`
- R2 bucket: `archive-image`

`marchivej` is suitable as the public brand because it is distinctive and already chosen for the
stable Vercel hostname. Internally, role-based names (`archive-core`, `archive-db`,
`archive-image`) make logs and secret configuration easier to understand.

## Security boundaries

- Browsers use Vercel; its server accesses the private Space using a server-only HF gateway token.
  A protected Space hides source but leaves its app publicly accessible, so it is not the chosen
  boundary for the core API.
- Every authoring endpoint verifies a Supabase JWT and the trusted `archive_admin` role.
- R2 write credentials exist only in the HF Space. Browsers receive a short-lived URL scoped to
  one object and one PUT operation.
- The R2 public origin is read-only and contains publishable media only.
- Imgur inline images remain primary. The optional R2 adapter currently uses Cloudflare's
  rate-limited `r2.dev` development hostname, read directly by browsers rather than proxied by
  Vercel. Enable production R2 serving via a reviewed Worker or Cloudflare-managed custom media
  subdomain when needed.
- Supabase service-role and database credentials are never exposed through `NEXT_PUBLIC_*`.
- Vercel verifies worker publication events with a shared HMAC secret before invalidating caches.

If the API and worker later need independent scaling, split their private runtimes without
changing the Web/API contracts. Public knowledge-engine inference/demo services are a separate
boundary; private content and behavioral data are not sent to public demos by default.
