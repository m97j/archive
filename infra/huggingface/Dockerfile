FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /workspace

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/content-engine/package.json ./packages/content-engine/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/observability/package.json ./packages/observability/package.json
RUN pnpm install --filter @archive/api... --filter @archive/worker... --frozen-lockfile
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts
COPY packages/content-engine ./packages/content-engine
COPY packages/db ./packages/db
COPY packages/observability ./packages/observability
RUN pnpm --filter @archive/api... --filter @archive/worker... build
RUN pnpm --filter @archive/api deploy --legacy --prod /out/api
RUN pnpm --filter @archive/worker deploy --legacy --prod /out/worker

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860
WORKDIR /app
COPY --from=build /out/api ./api
COPY --from=build /out/worker ./worker
COPY infra/huggingface/start.mjs ./start.mjs
EXPOSE 7860
USER node
CMD ["node", "start.mjs"]
