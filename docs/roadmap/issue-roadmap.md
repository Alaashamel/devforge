# Issue Roadmap

DevForge development is issue-driven. This document maps planned issues to
phases so maintainers and contributors can pick work with clear scope and
acceptance criteria.

Labels used across the repository:

```
feature · bug · enhancement · refactor · documentation · testing ·
security · performance · devops · ai · good-first-issue · help-wanted
```

Legend: ✅ = candidate to open now · 🔒 = security-sensitive (private when
needed) · 🧩 = small enough for a first-time contributor.

---

## Phase 1 — Application Foundation

| Issue | Type | Notes |
| --- | --- | --- |
| Scaffold `apps/api` Express app with config validation | feature | Zod-validated env, graceful boot |
| Scaffold `apps/web` Vite + React app | feature | |
| API health endpoint + readiness probe | feature | 🧩 |
| Centralized error handler + request IDs | feature | Stable error envelope |
| Structured JSON logging middleware | feature | |
| Web app shell: router, layout, theme tokens | feature | |
| API client with token injection + 401 refresh | feature | |
| Smoke tests: health endpoint, web boot | testing | |
| Wire root-level dev script (`npm run dev`) | devops | 🧩 |

## Phase 2 — Database

| Issue | Type | Notes |
| --- | --- | --- |
| Database migration tooling in `packages/database` | feature | |
| Identity tables migration (users, refresh/verify/reset tokens) | feature | |
| Organization tables migration (orgs, members, teams) | feature | |
| Project tables migration (projects, tasks, labels, comments, activity) | feature | |
| GitHub tables migration (connections, repositories, PRs, webhooks) | feature | |
| Collaboration tables migration (notifications, activities) | feature | |
| AI tables migration (analyses, conversations, messages, jobs) | feature | |
| Seed script for local development | feature | 🧩 |
| Index review + query plan checks | performance | |

## Phase 3 — Authentication

| Issue | Type | Notes |
| --- | --- | --- |
| Registration + email verification | feature | |
| Login/logout + JWT issuance | feature | |
| Refresh token rotation with reuse detection | security | 🔒 |
| Password reset flow | feature | |
| RBAC permission matrix middleware | feature | |
| Auth rate limiting | security | 🔒 |
| Auth integration tests | testing | Happy + failure paths |
| Argon2 password hashing service | security | 🔒 🧩 |

## Phase 4 — Project Management

| Issue | Type | Notes |
| --- | --- | --- |
| Project CRUD | feature | |
| Task/issue CRUD with statuses, priorities, assignees | feature | |
| Labels and task labeling | feature | 🧩 |
| Comments on tasks | feature | |
| Milestones | feature | |
| Kanban board (move + persist order) | feature | |
| Roadmap view | feature | |
| Filtering, search, sorting, pagination for tasks | feature | |
| Task activity history | feature | |
| Task dependencies with cycle detection | feature | |

## Phase 5 — GitHub

| Issue | Type | Notes |
| --- | --- | --- |
| GitHub OAuth connection flow | feature | |
| Encrypted token storage (AES-GCM) | security | 🔒 |
| Repository import + metadata sync | feature | |
| Branches/commits/PRs/issues views | feature | |
| Webhook registration + signature verification | feature | 🔒 |
| Rate limit handling with backoff/retry | performance | |
| Token refresh on expiry | feature | |

## Phase 6 — Analytics

| Issue | Type | Notes |
| --- | --- | --- |
| Commit/PR/issue/review metrics aggregation | feature | |
| Project velocity + health dashboard | feature | |
| Repository activity views | feature | |
| Analytics dashboard UI (Recharts) | feature | |

## Phase 7 — Real-Time

| Issue | Type | Notes |
| --- | --- | --- |
| Socket.io namespace + JWT auth + rooms | feature | |
| Redis adapter for horizontal scale | feature | |
| Presence with heartbeats | feature | |
| Persisted notifications + live push | feature | |
| Typing indicators (throttled) | feature | 🧩 |
| Team chat | feature | |
| Live task updates + activity feed | feature | |
| Reconnect + refetch strategy | feature | |

## Phase 8 — AI Foundation

| Issue | Type | Notes |
| --- | --- | --- |
| FastAPI service scaffold + health | feature | |
| Provider gateway (adapters + fallback) | feature | |
| Repository ingestion (fetch, filter, language detection) | feature | |
| Embeddings + vector store | feature | |
| RAG retrieval + context assembly | feature | |
| AI job contract (API ↔ AI) | feature | |
| Secret redaction before ingestion | security | 🔒 |

## Phase 9 — AI Features

| Issue | Type | Notes |
| --- | --- | --- |
| Repository analyzer (architecture/code/security/docs scores) | ai | |
| AI code review pipeline (severity classification) | ai | |
| Documentation/README generator with preview-and-approve | ai | |
| Engineering assistant (project-aware Q&A) | ai | |
| Prompt-injection defense review | security | 🔒 |
| AI output validation tests | testing | |

## Phase 10 — DevOps

| Issue | Type | Notes |
| --- | --- | --- |
| Dockerfiles for web/api/ai | devops | |
| Docker Compose stack (web/api/ai/postgres/redis/nginx) | devops | |
| CI: lint + test + build for all apps | ci | |
| CI: security audit + container scan | security | |
| Nginx reverse proxy + static serving | devops | |
| Health checks + structured logging in production shape | devops | |
| Metrics endpoints (Prometheus format) | observability | |

## Phase 11 — Quality

| Issue | Type | Notes |
| --- | --- | --- |
| Expand web component/integration tests | testing | |
| Expand API integration tests | testing | |
| Accessibility audit + fixes | a11y | |
| Performance pass: queries, bundles, caching | performance | |
| Security review + dependency audit | security | 🔒 |
| Error tracking (Sentry-compatible) | observability | |

## Phase 12 — Production Release

| Issue | Type | Notes |
| --- | --- | --- |
| Production environment configuration | devops | |
| Deployment guide (docker, CI/CD pipelines) | documentation | |
| Onboarding + demo environment | documentation | |
| Release notes + versioning | documentation | |

---

## Good first issues

Hand-picked small scopes for first-time contributors:

- 🧩 API health endpoint + readiness probe (Phase 1)
- 🧩 Root dev script wiring (Phase 1)
- 🧩 Seed script for local development (Phase 2)
- 🧩 Labels and task labeling (Phase 4)
- 🧩 Typing indicators (Phase 7)

---

*Related: [ROADMAP](../ROADMAP.md) · [CONTRIBUTING](../CONTRIBUTING.md)*
