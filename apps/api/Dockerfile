# syntax=docker/dockerfile:1
# DevForge API — Express service (depends on the @devforge/database workspace).
# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci

FROM node:20-alpine AS release
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY apps ./apps
COPY packages ./packages
# Rebuild workspace links and drop dev dependencies from the runtime image.
RUN npm prune --omit=dev
USER node
EXPOSE 4000
CMD ["node", "apps/api/src/server.js"]
