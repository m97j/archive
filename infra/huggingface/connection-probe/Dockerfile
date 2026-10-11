FROM node:24-bookworm-slim
WORKDIR /app/infra/huggingface/connection-probe
COPY infra/huggingface/connection-probe/package.json infra/huggingface/connection-probe/package-lock.json ./
RUN npm ci --ignore-scripts
COPY infra/huggingface/connection-probe/prisma ./prisma
COPY infra/huggingface/connection-probe/prisma.config.ts ./prisma.config.ts
RUN npm run generate
COPY infra/huggingface/connection-probe/*.mjs ./
COPY packages/db/src/runtime-config.ts /app/packages/db/src/runtime-config.ts
COPY packages/db/certificates /app/packages/db/certificates
ENV NODE_ENV=production
ENV PORT=7860
USER node
EXPOSE 7860
CMD ["node", "server.mjs"]
