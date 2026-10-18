# MCP server image (streamable HTTP). Build from the repo root: docker build -f apps/mcp/Dockerfile .
# Same shape as apps/rpc/Dockerfile: npm installs in a Node stage, Bun runs the TypeScript sources directly.
FROM node:22-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/contract/package.json packages/contract/
COPY packages/domain/package.json packages/domain/
RUN npm ci --omit=dev --workspace @examinus/mcp \
  && mkdir -p apps/mcp/node_modules packages/contract/node_modules packages/domain/node_modules

FROM oven/bun:1-slim

WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/mcp/node_modules apps/mcp/node_modules
COPY --from=deps /app/packages/contract/node_modules packages/contract/node_modules
COPY --from=deps /app/packages/domain/node_modules packages/domain/node_modules
COPY package.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/contract/package.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY packages/domain/package.json packages/domain/
COPY packages/domain/src packages/domain/src
COPY apps/mcp/src apps/mcp/src

WORKDIR /app/apps/mcp
# Cloud Run sends traffic to $PORT (8080) on all interfaces.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
USER bun
CMD ["bun", "src/http.ts"]
