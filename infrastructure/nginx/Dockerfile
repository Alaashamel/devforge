# syntax=docker/dockerfile:1
# DevForge edge nginx — reverse proxy + static entry point.
# Build from the infrastructure/nginx directory (or with -f from repo root).
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
