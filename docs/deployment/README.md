# Deploying DevForge

DevForge runs as a five-service Docker Compose stack:

| Service | Port | Description |
| --- | --- | --- |
| **nginx** | 8080 (configurable) | Reverse proxy — entry point for the browser |
| **web** | 80 (internal) | Vite-built React SPA served by nginx |
| **api** | 4000 (internal) | Express REST API + Socket.io realtime |
| **ai** | 5001 (internal) | FastAPI Python AI service |
| **postgres** | 5432 (internal) | pgvector-backed database |

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A GitHub OAuth App (for repository imports, PR webhooks and the docs/approval flow)
- An AI provider key (OpenAI or Anthropic) **or** a local Ollama instance
- A domain name with TLS termination (e.g. via a cloud load balancer in front of port 8080)

## Quick start

```bash
# Clone the repository
git clone https://github.com/Alaashamel/devforge.git && cd devforge

# Copy and fill in production secrets
cp .env.example .env.production
# Edit .env.production — every secret must be set explicitly in production

# Build and start the stack
docker compose --env-file .env.production up --build -d

# Run database migrations
docker compose exec api node packages/database/src/migrate.js

# (Optional) Seed demo data
docker compose exec api node packages/database/src/seed.js

# Open the UI
open http://localhost:8080
```

## Production environment

Copy `.env.production.example` and fill in every value. The API refuses to start
in production when these secrets are left at their dev defaults:

| Variable | Minimum | Notes |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | 32 chars | Access-token signing secret |
| `GITHUB_ENCRYPTION_KEY` | 16 chars | AES-256-GCM key for encrypted GitHub tokens |
| `AI_JOB_SECRET` | 16 chars | HMAC secret shared with the AI service |
| `API_BASE_URL` | public URL | Must not be `localhost` — used for webhooks |

The web container is built with `VITE_API_URL=/api/v1` (relative), so it
talks to the API through the same nginx origin. No cross-origin configuration
is needed.

## Health checks

Every container exposes a health endpoint:

- **api** — `GET /api/v1/health/ready` (200 = ok, 503 = degraded)
- **ai** — `GET /health`
- **nginx** — TCP port 80 (Docker default)

Docker Compose wires these as `healthcheck` directives and gates dependent
services on `service_healthy`.

## Monitoring

- `GET /metrics` (api) — Prometheus text exposition format (counters, histograms, process gauges).
- Structured JSON logging via pino (`LOG_LEVEL` env var).

Point a Prometheus instance at `http://api:4000/metrics` and scrape on a
30-second interval.

## TLS termination

Nginx listens on plain HTTP. In production, place a TLS-terminating reverse
proxy (cloud load balancer, Caddy, traefik, or an additional nginx with
certificates) in front of port 8080. The API sets `trust proxy 1` and reads
`X-Forwarded-Proto` for secure cookie decisions.

## Backups

```bash
# Dump the database
docker compose exec postgres pg_dump -U devforge devforge > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U devforge devforge
```

## Scaling

The API and AI service are stateless horizontally (sessions are JWT-based;
realtime uses Socket.io in-memory presence). For multi-instance deployments
behind a load balancer, swap in the Socket.io Redis adapter by setting
`REDIS_URL` and adding a Redis service to the compose file.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API exits immediately on startup | Check that all production secrets are set in `.env.production` |
| AI service 502 from API | Verify `AI_SERVICE_URL` and `AI_JOB_SECRET` match between API and AI containers |
| Socket.io connection refused | Ensure nginx `/socket.io/` location has websocket upgrade headers |
| Database connection refused | Check `postgres` container is healthy (`docker compose ps`) |
