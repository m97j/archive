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

Private Fastify API and background publication worker for
[`m97j/archive`](https://github.com/m97j/archive). The public reader and authenticated authoring
workspace are served by Vercel.

HF gateway access uses a server-only, least-privilege HF token. Administrator operations also
require a verified Supabase user JWT with the `archive_admin` role; the HF token is not an
administrator credential. Public research/inference demos live separately in `knowledge-engine`.
