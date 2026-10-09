# API image. Build from the repo root: docker build -f apps/rpc/Dockerfile .
# Bun runs the TypeScript sources directly, so there is no build step. Dependencies are installed with npm
# (Node stage) and copied into the Bun image.
FROM node:22-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/rpc/package.json apps/rpc/
COPY packages/contract/package.json packages/contract/
RUN npm ci --omit=dev --workspace @examora/rpc \
  && mkdir -p apps/rpc/node_modules packages/contract/node_modules

FROM oven/bun:1-slim

WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/rpc/node_modules apps/rpc/node_modules
COPY --from=deps /app/packages/contract/node_modules packages/contract/node_modules
COPY package.json ./
COPY apps/rpc/package.json apps/rpc/
COPY packages/contract/package.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY apps/rpc/src apps/rpc/src

WORKDIR /app/apps/rpc
# Cloud Run sends traffic to $PORT (8080) on all interfaces.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER bun
CMD ["bun", "src/main.ts"]
