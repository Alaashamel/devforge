# DevForge Architecture

This document describes the product and technical architecture of DevForge.
It is the canonical reference for how the system is organized and why.

- **Status:** Active
- **Last updated:** Phase 0

---

## 1. Architecture principles

1. **Separation of concerns.** Applications, shared packages, infrastructure
   and documentation are strictly separated. Domain logic lives in the API,
   not in the frontend or the AI service.
2. **Modular monorepo.** One repository, multiple independently evolvable
   packages. Cross-cutting concerns (config, database tooling, shared types)
   are shared through `packages/`.
3. **Boundaries over cleverness.** Each service owns its data and exposes a
   small, deliberate API. The AI service is reachable only through the API,
   never directly by the browser.
4. **Database as source of truth.** PostgreSQL is the system of record. Redis
   is a supporting store for caching, rate limiting, queues and real-time
   pub/sub — never the primary persistence layer.
5. **Security first.** Authentication, authorization, validation, secret
   management and rate limiting are designed in from day one, not bolted on.
6. **AI that engineers, not chats.** Every AI feature solves a concrete
   engineering problem, uses structured outputs, and validates results before
   persisting anything.
7. **Working state after every phase.** Each development phase leaves the
   repository runnable and tested.

## 2. System overview

```
                         ┌──────────────────────────────┐
                         │          Browser             │
                         │   React SPA  (apps/web)      │
                         └──────────────┬───────────────┘
                                        │  HTTPS + WebSocket
                     ┌──────────────────▼──────────────────┐
                     │              Nginx                  │
                     │        reverse proxy / TLS          │
                     └──────────────────┬──────────────────┘
                                        │
                    ┌───────────────────▼────────────────────┐
                    │          API  (apps/api)              │
                    │   Express · REST · Socket.io · JWT    │
                    │   modules: auth, orgs, projects,      │
                    │   github, analytics, realtime, ai-gw  │
                    └───┬────────────┬──────────┬───────────┘
                        │            │          │
                 ┌──────▼───┐  ┌─────▼─────┐  ┌─▼──────────────────┐
                 │PostgreSQL│  │  Redis    │  │  AI (apps/ai)     │
                 │ system   │  │ cache /   │  │  FastAPI          │
                 │ of record│  │ queue /   │  │  provider gateway │
                 └──────────┘  │ pub-sub   │  │  ingestion / RAG  │
                               └───────────┘  └───────────────────┘
```

## 3. Application boundaries

### 3.1 Web application (`apps/web`)

A React single-page application. Owns all user-facing presentation.

- **State:** server state via TanStack Query; ephemeral client state via
  Zustand stores; forms via React Hook Form + Zod.
- **Real-time:** Socket.io client for notifications, presence and live updates.
- **No business logic:** the web app renders data and dispatches intents; the
  API is the only place domain rules live.

### 3.2 API (`apps/api`)

Express application organized into **domain modules**. Each module owns its
routes, controllers, services and data access.

| Module | Responsibility |
| --- | --- |
| `auth` | Registration, login, JWT + refresh tokens, password flows, OAuth. |
| `organizations` | Organizations, teams, members, invitations, RBAC. |
| `projects` | Projects, tasks, issues, labels, milestones, roadmaps, comments, activity. |
| `github` | OAuth connection, repository import, PRs, branches, commits, webhooks. |
| `analytics` | Engineering metrics and project health. |
| `realtime` | Socket.io namespaces, presence, notifications. |
| `ai-gateway` | Proxies AI service requests, enforces org-level quotas and caching. |

Cross-cutting middleware: request IDs, logging, error handling, validation,
auth, RBAC, rate limiting, CORS.

### 3.3 AI service (`apps/ai`)

A Python/FastAPI service. It owns repository ingestion, embeddings, vector
search (RAG), and the provider-agnostic model gateway.

The browser never talks to the AI service directly. The API translates user
intents into bounded AI jobs, stores structured results, and serves them back.

### 3.4 Shared packages (`packages/`)

- `ui` — shared React primitives used by the web app.
- `shared` — shared constants, schemas and utilities used by web + api.
- `database` — schema definitions, migrations and seed tooling.
- `config` — shared configuration presets.
- `eslint-config` — shared ESLint presets.

## 4. Data architecture

See [docs/architecture/data-model.md](./data-model.md) for the full entity
relationship model. Summary:

- **PostgreSQL** stores all persistent entities across identity, orgs, work
  items, GitHub metadata, analytics and AI results.
- **Redis** stores cache entries, rate-limit counters, background job queues,
  real-time presence state and Socket.io pub/sub.
- **Vector embeddings** for RAG are managed by the AI service (pgvector or a
  dedicated vector store — see ADR-003).

## 5. API architecture

See [docs/architecture/api-design.md](./api-design.md). Summary:

- REST under `/api/v1`, JSON throughout, stable error envelope.
- JWT access tokens + rotating refresh tokens.
- Pagination, filtering, sorting and search conventions shared across
  list endpoints.
- Socket.io on `/realtime` for collaboration events.

## 6. AI architecture

See [docs/architecture/ai-service-architecture.md](./ai-service-architecture.md).
Summary:

```
Provider Layer → Prompt Layer → Context Retrieval (RAG)
             → Model Invocation → Structured Output → Validation
             → Application Logic → Persistence → UI
```

- Provider-agnostic gateway so models can be swapped without application
  changes.
- Structured outputs validated before any AI result is persisted.
- No secrets are ever sent to models.

## 7. Authentication & authorization

See ADR-002 and [docs/architecture/api-design.md](./api-design.md). Summary:

- Passwords hashed with Argon2.
- Short-lived JWT access tokens + refresh token rotation with reuse detection.
- Email verification and password reset flows.
- GitHub OAuth for repository integration.
- RBAC with five roles: Owner, Admin, Maintainer, Developer, Viewer.
- Permission checks enforced server-side on every protected route.

## 8. Real-time architecture

See [docs/architecture/realtime-architecture.md](./realtime-architecture.md).
Summary:

- Socket.io with the Redis adapter for horizontal scaling.
- Rooms scoped to organizations, projects and tasks.
- Server-authoritative events; clients refetch on reconnect.
- Notifications, presence, typing indicators, live task updates and activity
  feed.

## 9. GitHub integration

The API is the only component with access to GitHub credentials. Tokens are
encrypted at rest and refreshed on expiry; API calls handle rate limits with
backoff. Webhooks are signature-verified. The AI service receives sanitized
repository content only.

## 10. Testing strategy

- **Web:** Vitest + React Testing Library — unit and component tests.
- **API:** Vitest + Supertest — unit and integration tests.
- **AI:** pytest — unit and integration tests.
- **System:** Playwright — end-to-end flows.
- **CI:** lint → test → build → security checks on every PR.

## 11. DevOps & observability

- Docker images for web, api, ai, PostgreSQL and Redis; Docker Compose for
  local development.
- Nginx as reverse proxy with static asset serving.
- GitHub Actions CI/CD: lint, test, build, security and deployment workflows.
- Structured JSON logging, request IDs, health checks; metrics and error
  tracking added in Phase 10–11.

## 12. Design decisions

Significant decisions are recorded as Architecture Decision Records:

| ADR | Decision |
| --- | --- |
| [ADR-001](./decisions/ADR-001-database-choice.md) | PostgreSQL + Redis; MongoDB deferred |
| [ADR-002](./decisions/ADR-002-authentication-strategy.md) | JWT + refresh rotation + RBAC |
| [ADR-003](./decisions/ADR-003-ai-service-boundary.md) | Dedicated AI service with provider gateway |
| [ADR-004](./decisions/ADR-004-realtime-architecture.md) | Socket.io + Redis adapter |
| [ADR-005](./decisions/ADR-005-monorepo-structure.md) | npm-workspaces monorepo |
| [ADR-006](./decisions/ADR-006-frontend-stack.md) | React + Vite, JavaScript (no TypeScript) |

## 13. Key risks and mitigations

| Risk | Mitigation |
| --- | --- |
| AI service becomes a monolith | Layered pipeline; provider abstraction; per-capability services |
| Real-time sprawl | Server-authoritative events; event budget discipline |
| GitHub rate limits | Caching, backoff, careful pagination |
| Scope creep | 13 incremental phases; each phase shippable |
| AI results untrusted | Structured outputs + validation before persistence |

---

*Related: [README](../README.md) · [ROADMAP](../ROADMAP.md) · [data model](./data-model.md) · [ADRs](./decisions/)*
