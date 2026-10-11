FROM node:24-bookworm-slim AS node-runtime
WORKDIR /deps
COPY infra/huggingface/connection-probe/package.json infra/huggingface/connection-probe/package-lock.json ./
RUN npm ci --ignore-scripts
FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
WORKDIR /app/infra/huggingface/operations
COPY --from=node-runtime /deps/node_modules /app/infra/huggingface/connection-probe/node_modules
COPY infra/huggingface/operations/*.mjs ./
COPY packages/db/src/runtime-config.ts /app/packages/db/src/runtime-config.ts
COPY packages/db/certificates /app/packages/db/certificates
COPY packages/db/scripts/import-legacy-core.mjs /app/packages/db/scripts/import-legacy-core.mjs
COPY supabase/migrations /app/supabase/migrations
RUN useradd --uid 1000 --create-home archiveops && mkdir -p /app/backups && chown -R 1000:1000 /app/backups
ENV PORT=7860
ENV NODE_ENV=production
USER 1000:1000
EXPOSE 7860
ENTRYPOINT ["node", "server.mjs"]
