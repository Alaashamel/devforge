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
| Index review + query plan checks | performance | 9 baseline migrations + FK/hot-path indexes landed |

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
| Kanban board (move + persist order) | feature | ✅ done — board + quick-add + drag-to-move persisting position |
| Roadmap view | feature | ✅ done — tasks grouped by milestone + backlog |
| Filtering, search, sorting, pagination for tasks | feature | ✅ done |
| Task activity history | feature | ✅ done — actor-scoped audit ledger |
| Task dependencies with cycle detection | feature | ✅ done — add/list/remove + cycle rejection |

## Phase 5 — GitHub

| Issue | Type | Notes |
| --- | --- | --- |
| GitHub OAuth connection flow | feature | ✅ done — HMAC-signed state, callback redirects |
| Encrypted token storage (AES-GCM) | security | ✅ done — v1 envelope, app-level expiry → 409 🔒 |
| Repository import + metadata sync | feature | ✅ done — PRs upserted during sync |
| Branches/commits/PRs/issues views | feature | ✅ done — live views + DB-backed PR list |
| Webhook registration + signature verification | feature | ✅ done — sha256 HMAC, raw-body route 🔒 |
| Rate limit handling with backoff/retry | performance | ✅ done — 5xx retry + rate-limit wait |
| Token refresh on expiry | feature | ✅ done — GitHub 401 marks connection expired; reconnect via OAuth |

## Phase 6 — Analytics

| Issue | Type | Notes |
| --- | --- | --- |
| Commit/PR/issue/review metrics aggregation | feature | ✅ done — overview + health aggregate live tables; commits left for real-time sync |
| Project velocity + health dashboard | feature | ✅ done — weekly buckets, weighted health score, developer metrics materialized |
| Repository activity views | feature | ✅ done — repo summaries + per-repo monthly/recent/review activity |
| Analytics dashboard UI (Recharts) | feature | ✅ done — lazy-loaded page with velocity/completion charts + tables |

## Phase 7 — Real-Time

| Issue | Type | Notes |
| --- | --- | --- |
| Socket.io hub + JWT auth + rooms | feature | ✅ done — server-authorized rooms (user/org/project/task/chat), 11 integration tests |
| Redis adapter for horizontal scale | feature | deferred — in-process hub ships first; adapter documented for Phase 10 |
| Presence with heartbeats | feature | ✅ done — 90s TTL sweep + `presence:update` broadcasts + sidebar dots |
| Persisted notifications + live push | feature | ✅ done — inbox, unread badge, mark read/all, `notification:new` push |
| Typing indicators (throttled) | feature | ✅ done 🧩 — 2s emit throttle + 3s visibility window |
| Team chat | feature | ✅ done — `chat_messages` table (0009), cursor pagination, `chat:message` broadcast |
| Live task updates + activity feed | feature | ✅ done — `task:created`/`task:updated`/`task:comment` + `activity:new` |
| Reconnect + refetch strategy | feature | ✅ done — re-join rooms on connect + query invalidation on live events |

## Phase 8 — AI Foundation

| Issue | Type | Notes |
| --- | --- | --- |
| FastAPI service scaffold + health | feature | ✅ done — `apps/ai` with `/healthz` router |
| Provider gateway (adapters + fallback) | feature | ✅ done — OpenAI/Anthropic/local + offline hashing embedder |
| Repository ingestion (fetch, filter, language detection) | feature | ✅ done — tarball fetch, filter rules, language map, manifests, chunking |
| Embeddings + vector store | feature | ✅ done — pgvector `ai_document_chunks` (migration 0010) + HNSW index |
| RAG retrieval + context assembly | feature | ✅ done — hybrid keyword + vector search, token-budgeted |
| AI job contract (API ↔ AI) | feature | ✅ done — HMAC job/archive tokens, `POST /jobs/{jobId}`, typed results |
| Secret redaction before ingestion | security | ✅ done — scan + redact before embedding 🔒 |
| Node API orchestration + archive streaming | feature | ✅ done — analyses/jobs routes + signed `/ai/archive/:repoId` |

## Phase 9 — AI Features

| Issue | Type | Notes |
| --- | --- | --- |
| Repository analyzer (architecture/code/security/docs scores) | ai | ✅ done — `analyzer` type (migration 0011): 4 scored dimensions, strengths/risks/recommendations, run-and-poll report UI, PR #21 |
| AI code review pipeline (severity classification) | ai | ✅ done — `code_review` type: PR diff in job payload, severity-classified findings + review score, per-PR panel, PR #23 |
| Documentation/README generator with preview-and-approve | ai | ✅ done — `docs`/`readme` types: validated markdown drafts, preview-and-approve commits via GitHub Contents API, PR #25 |
| Engineering assistant (project-aware Q&A) | ai | streamed responses + persisted chat |
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

---

*Related: [ROADMAP](../ROADMAP.md) · [CONTRIBUTING](../CONTRIBUTING.md)*
