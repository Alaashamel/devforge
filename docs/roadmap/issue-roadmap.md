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
| Scaffold `apps/api` Express app with config validation | feature | ✅ done — Zod-validated env, graceful boot |
| Scaffold `apps/web` Vite + React app | feature | ✅ done |
| API health endpoint + readiness probe | feature | ✅ done 🧩 |
| Centralized error handler + request IDs | feature | ✅ done — stable error envelope |
| Structured JSON logging middleware | feature | ✅ done — pino with redaction |
| Web app shell: router, layout, theme tokens | feature | ✅ done |
| API client with token injection + 401 refresh | feature | Client added; auth lands in Phase 3 |
| Smoke tests: health endpoint, web boot | testing | ✅ done — 17 tests passing |
| Wire root-level dev script (`npm run dev`) | devops | ✅ done 🧩 |

## Phase 2 — Database

| Issue | Type | Notes |
| --- | --- | --- |
| Database migration tooling in `packages/database` | feature | ✅ done — versioned runner + CLI |
| Identity tables migration (users, refresh/verify/reset tokens) | feature | ✅ done |
| Organization tables migration (orgs, members, teams) | feature | ✅ done |
| Project tables migration (projects, tasks, labels, comments, activity) | feature | ✅ done |
| GitHub tables migration (connections, repositories, PRs, webhooks) | feature | ✅ done |
| Collaboration tables migration (notifications, activities) | feature | ✅ done |
| AI tables migration (analyses, conversations, messages, jobs) | feature | ✅ done |
| Analytics migration (developer_metrics) | feature | ✅ done |
| Seed script for local development | feature | ✅ done 🧩 |
| Index review + query plan checks | performance | 7 baseline migrations + FK/hot-path indexes landed |

## Phase 3 — Authentication

| Issue | Type | Notes |
| --- | --- | --- |
| Registration + email verification | feature | ✅ done |
| Login/logout + JWT issuance | feature | ✅ done |
| Refresh token rotation with reuse detection | security | ✅ done — replayed token revokes the family 🔒 |
| Password reset flow | feature | ✅ done |
| RBAC permission matrix middleware | feature | ✅ done — requireAuth + authorize(permission) |
| Auth rate limiting | security | ✅ done — per-route sliding window 🔒 |
| Auth integration tests | testing | ✅ done — 53 new API tests incl. happy + failure paths |
| Argon2 password hashing service | security | ✅ done — Argon2id via @node-rs/argon2 🔒 🧩 |

## Phase 4 — Project Management

| Issue | Type | Notes |
| --- | --- | --- |
| Project CRUD | feature | ✅ done — orgs, projects, members, soft archive |
| Task/issue CRUD with statuses, priorities, assignees | feature | ✅ done — + types, parents, due dates, estimates |
| Labels and task labeling | feature | ✅ done 🧩 — replacement API + label chips in UI |
| Comments on tasks | feature | ✅ done |
| Milestones | feature | ✅ done — statuses + task counts |
| Kanban board (move + persist order) | feature | ✅ done — board + quick-add landed; drag-persist follow-up |
| Roadmap view | feature | follow-up |
| Filtering, search, sorting, pagination for tasks | feature | ✅ done |
| Task activity history | feature | ✅ done — actor-scoped audit ledger |
| Task dependencies with cycle detection | feature | add/list/remove landed; cycle detection follow-up |

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
