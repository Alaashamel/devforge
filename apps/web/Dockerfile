# syntax=docker/dockerfile:1
# DevForge Web — Vite + React static site, served by nginx.
# Build from the repository root: docker build -f apps/web/Dockerfile .
#   --build-arg VITE_API_URL=/api/v1
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci
COPY apps/web ./apps/web
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w apps/web

FROM nginx:alpine AS serve
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
