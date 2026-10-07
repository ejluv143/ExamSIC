# API image. Build from the repo root: docker build -f apps/rpc/Dockerfile .
# Node runs the TypeScript sources directly (type stripping), so there is no build step.
FROM node:22-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rpc/package.json apps/rpc/
COPY packages/contract/package.json packages/contract/
RUN pnpm install --frozen-lockfile --prod --filter "@examora/rpc..."

COPY packages/contract/src packages/contract/src
COPY apps/rpc/src apps/rpc/src

WORKDIR /app/apps/rpc
# Cloud Run sends traffic to $PORT (8080) on all interfaces.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER node
CMD ["node", "src/main.ts"]
