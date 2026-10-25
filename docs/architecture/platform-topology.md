# Platform topology

## Current deployment target

```text
Public reader → Vercel / Next.js → private archive-core API → Supabase PostgreSQL
Owner → HF private access → archive-core gateway → Next.js CMS → local API
                                             └→ API + durable worker
Worker → authenticated knowledge-engine inference → embedding / translation
Worker → signed Vercel webhook → published-page cache invalidation
Reader → public Imgur / optional R2 images
```

The reader and owner console are separate Next.js applications. `apps/web` contains no owner
authentication, editor or management API implementation. Reserved owner routes return 404.
`apps/cms` runs alongside the API and worker inside the private Docker Space. Its GUI retains
Supabase user authentication and independently verified `archive_admin` privileges: access to
an HF repository is not, by itself, authorization to mutate site data.

The gateway exposes port 7860, routing `/v1/*` and `/health` to the loopback Fastify API on 7861
and other requests to the loopback CMS on 3001. The worker has no public listener. This keeps
business APIs and CPU-bound external ML inference independently replaceable without coupling
publication availability to model loading. Drizzle/pg retains the existing PostgreSQL transaction,
queue, immutable-history and search capabilities; an ORM does not determine ML ecosystem support.

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

- Readers use Vercel; its server accesses the private Space using a server-only HF gateway token.
  A protected Space hides source but leaves its app publicly accessible, so it is not the chosen
  boundary for the core API.
- Every authoring endpoint verifies a Supabase JWT and the trusted `archive_admin` role.
- Owners use the private HF app plus their Supabase Auth account, not a database password.
  Optional remembered sessions have a 90-day inactivity and 180-day absolute cap. Access JWTs
  remain short-lived and are refreshed; neither this option nor HF privacy makes a device trusted
  forever. Browser storage restrictions and provider-side revocation may require login sooner.
- R2 write credentials exist only in the HF Space. Browsers receive a short-lived URL scoped to
  one object and one PUT operation.
- The R2 public origin is read-only and contains publishable media only.
- Imgur inline images remain primary. The optional R2 adapter currently uses Cloudflare's
  rate-limited `r2.dev` development hostname, read directly by browsers rather than proxied by
  Vercel. Enable production R2 serving via a reviewed Worker or Cloudflare-managed custom media
  subdomain when needed.
- Supabase service-role and database credentials are never exposed through `NEXT_PUBLIC_*`.
- Vercel verifies worker publication events with a shared HMAC secret before invalidating caches.

`knowledge-engine` keeps its public demo while the new stateless machine endpoints require a
separate shared inference secret. Only published content is used for embedding/translation jobs;
translation results become new reviewable drafts, never automatic publications. Code fences,
math, URLs and embeds are preserved; code comments are not translated by the current pipeline.
Dense/sparse model revision and precision IDs must match. The initial exact ranking is bounded
to 500 published candidates, with lexical fallback on cold start, failure or incompatible vectors.
This is a small-archive implementation, not an ANN index, multi-vector or multimodal model.

Optional activity v2 remains disabled. Independent session-processing and model-improvement
choices use a 30-minute-idle/12-hour-cap session, not a persistent visitor identifier. Vercel
resolves published content IDs, encrypts minimal events and writes directly to a new private HF
Bucket under separate purpose prefixes. No raw paths, queries, form text, IP or email are stored.
Defaults are two-hour session raw expiry and 90-day model-improvement raw expiry, followed by
the real scheduled purge; capability-based deletion and tombstones handle withdrawal/replay.
A stale cleanup heartbeat stops new capture. The former Space-to-Dataset v1 writer is retired.
See [setup and activation gates](../operations/session-activity.md): actual private Bucket,
contracts/transfers/notice, edge limits, deletion tests and hourly cleanup must be reviewed before
all three `ACTIVITY_*` flags are enabled. Pseudonymous events are not automatically anonymous;
this implementation is neither a regulated EMR audit system nor a legal compliance certification.

The visual site-layout release editor, behavioral personalization and custom research models
remain future extensions. Changing site structure/styles still requires a reviewed source release.
