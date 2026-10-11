# Archive

`Archive` is a multilingual research archive, engineering portfolio, and evidence-backed
publishing system. Anonymous visitors receive a document-first public site; the owner uses a
Supabase-authenticated admin workspace for authoring, taxonomy, review, compilation, and
publication.

## Architecture

- **Web:** Next.js on Vercel (`https://marchivej.vercel.app` planned)
- **Core:** Fastify API and compilation/outbox worker in a private Hugging Face Docker Space
- **Data/Auth:** Supabase PostgreSQL and Auth
- **Media:** Imgur inline images, with an optional Cloudflare R2 presigned-upload adapter
- **Private recovery data:** Encrypted backups in a private HF dataset; keys stored separately
- **Content:** Markdown compiled into sanitized HTML with code, math, Mermaid, YouTube, images,
  and sandboxed Hugging Face demos

The source is a pnpm/Turborepo monorepo. `apps/web` is public-facing and contains the protected
owner console; `apps/api` is the authorization and domain boundary; `apps/worker` handles durable
background compilation and publication events.

## Local verification

```text
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Environment templates live beside each application. Never commit real tokens or database
credentials.

## Documentation

- [Deployment readiness](docs/operations/deployment-readiness.md)
- [Static fallback portfolio](docs/index.md)
- [Static fallback operations](docs/operations/static-fallback.md)
- [Current platform topology](docs/architecture/platform-topology.md)
- [Cost-driven Azure to PaaS decision](docs/decisions/0001-cost-optimized-paas.md)
- [Historical Azure IaC](infra/legacy/azure/README.md)
- [Historical GitHub Actions](.github/workflow-archive/azure/README.md)

## 한국어 요약

공개 영역은 블로그·연구자 개인 사이트·포트폴리오·기술/학술 문서 아카이브로 사용하고,
로그인한 관리자 영역은 콘텐츠 작성·검토·게시용 GUI/CMD로 사용합니다. 과거 Azure 기반
IaaS형 구성과 현재의 저비용 PaaS 구성은 모두 포트폴리오 기록으로 보존합니다.
