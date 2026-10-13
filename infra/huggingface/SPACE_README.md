---
title: Archive Core
emoji: 🗃️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Archive Core

Private Next.js CMS, Fastify API and background worker for
[`m97j/archive`](https://github.com/m97j/archive). The reader is served by Vercel; the
authenticated owner workspace is available here behind private HF access.

HF gateway access uses a server-only, least-privilege HF token. Administrator operations also
require a verified Supabase user JWT with the `archive_admin` role; the HF token is not an
administrator credential. Public research/inference demos live separately in `knowledge-engine`.
