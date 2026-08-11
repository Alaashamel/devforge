# System Overview

This document describes the end-to-end DevForge system: actors, user
journeys, service boundaries and cross-cutting concerns.

## 1. Actors

| Actor | Description |
| --- | --- |
| Owner | Root role for an organization. Billing, ownership, transfer, everything. |
| Admin | Manages members, teams, permissions and org settings. |
| Maintainer | Creates projects, manages tasks/issues, imports repositories. |
| Developer | Works on assigned work items, reviews code, runs AI analysis. |
| Viewer | Read-only access to org/project content. |
| Anonymous | Can register, log in, reset password, request email verification. |
| GitHub | External system; delivers webhooks and answers API calls. |
| AI service | Internal service; executes analysis, review and generation jobs. |

## 2. Primary user journeys

### 2.1 Onboarding
1. Register with email + password (verification email sent).
2. Verify email, complete profile.
3. Create an organization (becomes Owner).
4. Invite team members (Admin) or join via invitation link.

### 2.2 Project management
1. Create a project (with key, e.g. `DF`).
2. Configure labels and statuses.
3. Create milestones and roadmap.
4. Create tasks/issues with assignees, priorities, due dates.
5. Drag tasks across kanban columns.
6. Comment and watch live activity.

### 2.3 GitHub integration
1. Connect GitHub via OAuth (scopes: repos, read:org, pull_requests).
2. Import repositories into the organization.
3. View branches, commits, PRs and issues.
4. AI code review triggers on PR events delivered by webhook.

### 2.4 AI analysis
1. Select an imported repository.
2. Run repository analysis → pipeline ingests, analyzes, scores.
3. View health scores and actionable recommendations.
4. Generate README/docs → preview → approve (never silent overwrite).

### 2.5 Engineering assistant
1. Open the assistant for a project.
2. Ask questions grounded in repository content, issues and docs (RAG).
3. Request implementation plans, technical debt discovery, module explanations.

## 3. Service boundaries

| Service | Owns | Never owns |
| --- | --- | --- |
| Web | Presentation, client state | Domain rules, credentials, AI logic |
| API | Domain logic, auth, RBAC, integrations | Prompt engineering, embeddings |
| AI | Ingestion, embeddings, RAG, model calls | Persistence of org/business data (results stored via API) |
| PostgreSQL | Persistent entities | Ephemeral state |
| Redis | Cache, rate limits, queues, pub/sub | Source of truth |

## 4. Cross-cutting concerns

| Concern | Approach |
| --- | --- |
| Logging | Structured JSON logs with request IDs (API), Python logging (AI) |
| Errors | Centralized error handler; stable error envelope; AI service returns typed job status |
| Config | Environment-based; validated at boot; no secrets in code |
| Observability | Health endpoints, metrics endpoints, request tracing (Phase 10–11) |
| Security | Auth middleware, RBAC guards, validation, rate limiting, headers |
| Testing | Unit + integration per service; E2E across the system |

## 5. Deployment topology

Local: Docker Compose runs `web`, `api`, `ai`, `postgres`, `redis` behind
`nginx`. Production follows the same topology with managed PostgreSQL/Redis
and horizontal scaling for `api` and `ai`.

## 6. Environment configurations

| Environment | Purpose |
| --- | --- |
| `development` | Local defaults, hot reload, verbose logs, seeded data |
| `test` | Isolated DB, in-memory/no-op external calls |
| `staging` | Production-like, against staging GitHub app |
| `production` | Hardened, encrypted secrets, minimal logging of sensitive fields |

---

*Next: [backend architecture](./backend-architecture.md) · [api design](./api-design.md) · [data model](./data-model.md)*
