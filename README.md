<div align="center">

# DevForge

### AI-Powered Developer Platform & Engineering Workspace

[![Quality Gate](https://github.com/Alaashamel/devforge/actions/workflows/validate.yml/badge.svg)](https://github.com/Alaashamel/devforge/actions/workflows/validate.yml)
[![Security Audit](https://github.com/Alaashamel/devforge/actions/workflows/security.yml/badge.svg)](https://github.com/Alaashamel/devforge/actions/workflows/security.yml)
[![Docker Build](https://github.com/Alaashamel/devforge/actions/workflows/docker.yml/badge.svg)](https://github.com/Alaashamel/devforge/actions/workflows/docker.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![v1.0.0](https://img.shields.io/badge/version-1.0.0-green.svg)](./RELEASES.md)
[![Tests](https://img.shields.io/badge/tests-470+-brightgreen.svg)](#testing)

**Stop stitching tools together. Start shipping faster.**

DevForge unifies project management, GitHub integration, real-time collaboration, engineering analytics, and AI-assisted development — all in one workspace built for software teams.

---

</div>

## The Problem

Modern engineering teams juggle **5+ disconnected tools** — a project tracker, a code host, an AI assistant, a docs site, and an analytics dashboard — and lose context in the seams between them. DevForge eliminates that friction.

## What DevForge Does

<table>
<tr>
<td width="50%" valign="top">

### **Project Management**
Kanban boards, tasks, issues, milestones, roadmaps, labels, comments, and full-text search — all in one place.

### **GitHub Integration**
OAuth connection, repository import/sync, branches, commits, PRs, issues, and webhook-driven updates.

### **Engineering Analytics**
Velocity charts, health scores, contributor breakdowns, and repository activity — engineering health, not vanity metrics.

</td>
<td width="50%" valign="top">

### **AI Repository Analyzer**
Architecture, code quality, security, and documentation scores with strengths, risks, and actionable recommendations.

### **AI Code Review**
Severity-classified findings (INFO → CRITICAL) on pull request diffs, with a review score and fix suggestions.

### **AI Documentation Generator**
README and docs generation with preview-and-approve — approving a file commits it directly to GitHub.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### **Engineering Assistant**
Streamed, repo-scoped Q&A grounded in your actual codebase via RAG (retrieval-augmented generation).

### **Real-Time Collaboration**
Team chat, notifications, online presence, typing indicators, and live task updates via Socket.io.

</td>
<td width="50%" valign="top">

### **DevOps & Observability**
Docker Compose full-stack, CI/CD pipelines, Prometheus metrics, structured logging, and health checks.

### **Enterprise-Grade Security**
JWT + refresh token rotation, RBAC (5 roles), encrypted GitHub tokens (AES-256-GCM), rate limiting, and secret redaction.

</td>
</tr>
</table>

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Docker Compose              │
                    │                                         │
  Browser ────────►│  nginx ──► web (React SPA)              │
     :8080         │     │                                    │
                    │     ├──► api (Express + Socket.io)      │
                    │     │        │                          │
                    │     │        ├──► PostgreSQL (pgvector) │
                    │     │        └──► Redis                 │
                    │     │                                   │
                    │     └──► ai (FastAPI)                   │
                    │              ├──► OpenAI / Anthropic    │
                    │              └──► PostgreSQL (pgvector) │
                    └─────────────────────────────────────────┘
```

| Service | Technology | Port |
|---------|-----------|------|
| **Web** | React 19, Vite, Tailwind CSS, TanStack Query, Recharts | 5173 (dev) / 80 (prod) |
| **API** | Node.js, Express, Socket.io, JWT, Zod validation | 4000 |
| **AI** | Python, FastAPI, provider-agnostic model gateway, pgvector RAG | 5001 |
| **Database** | PostgreSQL 16 with pgvector extension | 5432 |
| **Proxy** | Nginx reverse proxy with websocket support | 8080 (prod) |

---

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/Alaashamel/devforge.git && cd devforge
docker compose up --build -d
docker compose exec api node packages/database/src/migrate.js
docker compose exec api node packages/database/src/seed.js
# → http://localhost:8080
```

### Local Development

```bash
git clone https://github.com/Alaashamel/devforge.git && cd devforge
cp .env.example .env
docker compose up -d postgres          # Start the database
npm install && npm run db:migrate && npm run db:seed
npm run dev                            # API + Web concurrently
```

| Service | URL |
|---------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Health | http://localhost:4000/api/v1/health |

### Demo Accounts

After seeding, log in with password `DevForgeDev123!`:

| Email | Role | Organization |
|-------|------|-------------|
| `alaa@devforge.test` | Owner | DevForge Inc. |
| `jordan@devforge.test` | Admin | Acme Labs |
| `sam@devforge.test` | Developer | DevForge Inc. |

---

## AI Capabilities

DevForge's AI service is **provider-agnostic** — works with OpenAI, Anthropic, or a local model. All AI operations follow a secure pipeline:

```
Input → Context Assembly → Prompt Construction → Model Call → Validation → Result
```

| Capability | What It Does | Security |
|-----------|-------------|----------|
| **Repository Analyzer** | Scores architecture, code quality, security, documentation (0-100) | Secret redaction before ingestion |
| **Code Review** | Classifies findings by severity on PR diffs | Diff submitted inline (no archive needed) |
| **Doc Generator** | Produces markdown drafts for preview | User approves before any commit |
| **Assistant** | Streamed Q&A grounded in repository chunks | Prompt injection defense, `<untrusted>` wrapping |

**Key invariant:** The browser never talks to the AI service directly. All requests flow through the API, which signs job tokens (HMAC-SHA256) and holds credentials server-side.

---

## Security

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Argon2id password hashing, HS256 JWT access tokens (15m), rotating refresh tokens (7d) with reuse detection |
| **Authorization** | 5-role RBAC (Owner → Viewer) with org + project composition (more permissive wins) |
| **GitHub Tokens** | AES-256-GCM encrypted at rest, HMAC-signed OAuth state, webhook signature verification |
| **AI Security** | Secret redaction before embedding, prompt injection defense, never execute AI output |
| **API Security** | Rate limiting (sliding window), request validation (Zod), request IDs for tracing |
| **DevOps** | Dependency auditing (npm audit + pip audit), Docker image builds, structured logging |

---

## Testing

**470+ tests** across four stacks, enforced by a CI quality gate on every push:

```bash
npm test                    # Web + API unit tests
python -m pytest            # AI service tests (145+)
npm run lint                # ESLint (JS) + ruff (Python)
npm run build               # Production build
npm run validate            # Structure + secrets check
```

| Stack | Tests | Framework |
|-------|-------|-----------|
| API (Express) | 220 | Vitest + Supertest |
| AI (FastAPI) | 146 | pytest + ruff |
| Web (React) | 89 | Vitest + React Testing Library |
| Database | 15 | Vitest |
| **Total** | **470+** | |

---

## Documentation

| Document | Description |
|----------|-------------|
| [**Architecture**](./ARCHITECTURE.md) | System design, principles, and service boundaries |
| [**Architecture Diagrams**](./docs/architecture/diagrams.md) | 8 Mermaid diagrams (system, auth, AI pipeline, ERD, realtime) |
| [**API Reference**](./docs/api/README.md) | All 85 HTTP endpoints + 6 Socket.io events |
| [**AI Service Docs**](./docs/ai/README.md) | Pipeline architecture, providers, security model |
| [**Database Docs**](./docs/database/README.md) | Schema, migrations, pgvector setup |
| [**Deployment Guide**](./docs/deployment/README.md) | Docker Compose, health checks, monitoring, TLS |
| [**CHANGELOG**](./CHANGELOG.md) | Release history |
| [**Contributing**](./CONTRIBUTING.md) | How to contribute |
| [**Security Policy**](./SECURITY.md) | Vulnerability reporting |

---

## Repository Structure

```
devforge/
├── apps/
│   ├── web/          React SPA (Vite + Tailwind)
│   ├── api/          Express REST API + Socket.io
│   ├── ai/           FastAPI Python AI service
│   └── docs/         Documentation site
├── packages/
│   ├── shared/       Shared utilities and constants
│   ├── database/     PostgreSQL migrations and seed data
│   ├── config/       Shared configuration
│   └── eslint-config/ Shared ESLint rules
├── infrastructure/
│   ├── nginx/        Reverse proxy configuration
│   └── monitoring/   Prometheus + Grafana dashboards
├── docs/
│   ├── architecture/ System design and diagrams
│   ├── api/          API endpoint reference
│   ├── ai/           AI service documentation
│   ├── database/     Schema and migration docs
│   ├── decisions/    Architecture Decision Records (ADRs)
│   └── deployment/   Production deployment guide
└── .github/
    ├── workflows/    CI/CD pipelines (validate, security, docker)
    └── ISSUE_TEMPLATE/  Issue templates
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API (:4000) and web (:5173) concurrently |
| `npm run dev:api` | API only |
| `npm run dev:web` | Web only |
| `npm run ai:dev` | AI service only (:5001, uvicorn with reload) |
| `npm run ai:test` | AI pytest suite |
| `npm run ai:lint` | AI ruff lint |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:down` | Roll back last migration |
| `npm run db:status` | Show applied/pending migrations |
| `npm run lint` | ESLint across all workspaces |
| `npm test` | Vitest across all workspaces |
| `npm run build` | Production web build |
| `npm run validate` | Repository structure and secrets check |

---

## Roadmap

DevForge was built in **13 incremental phases**, each leaving the repository in a working state:

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Product foundation | ✅ |
| 1 | Application foundation | ✅ |
| 2 | Database schema & migrations | ✅ |
| 3 | Authentication & RBAC | ✅ |
| 4 | Project management | ✅ |
| 5 | GitHub integration | ✅ |
| 6 | Engineering analytics | ✅ |
| 7 | Real-time collaboration | ✅ |
| 8 | AI foundation (service, RAG) | ✅ |
| 9 | AI features (analyzer, review, docs, assistant) | ✅ |
| 10 | DevOps (Docker, CI/CD, metrics) | ✅ |
| 11 | Quality (a11y, performance, security audit) | ✅ |
| 12 | Production release (v1.0.0) | ✅ |

See [ROADMAP.md](./ROADMAP.md) for detailed deliverables.

---

## License

[MIT](./LICENSE) — built with passion by [Alaashamel](https://github.com/Alaashamel)
