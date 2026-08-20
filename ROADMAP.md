# DevForge Roadmap

DevForge is built in 13 incremental phases. Every phase must leave the
repository in a working state: it builds, tests pass, and nothing that shipped
in an earlier phase regresses.

| Phase | Name | Focus | Exit criteria |
| --- | --- | --- | --- |
| 0 | Product Foundation | Architecture, standards, tooling, community docs | Repo scaffolded, CI validates structure, docs complete |
| 1 | Application Foundation | Frontend + backend run locally | `npm run dev` serves a working web + API with a health endpoint |
| 2 | Database | Schema, migrations, seed data | Full schema for identity → orgs → work → github → analytics |
| 3 | Authentication | Complete auth + RBAC | Registration/login/refresh/reset tested; role checks enforced |
| 4 | Project Management | Projects, tasks, issues, milestones, roadmaps | CRUD + filtering/search/kanban tested and usable |
| 5 | GitHub | OAuth, imports, PRs, webhooks | Connect a repo, view it, receive webhooks |
| 6 | Analytics | Dashboards, health, velocity | Meaningful engineering metrics rendered |
| 7 | Real-Time | Notifications, presence, chat, live updates | Live collaboration across sessions |
| 8 | AI Foundation | AI service, provider gateway, RAG | AI service up; ingestion + vector search work |
| 9 | AI Features | Analyzer, code review, docs, assistant | All four AI capabilities validated and usable |
| 10 | DevOps | Docker, CI/CD, monitoring | `docker compose up` runs the whole stack |
| 11 | Quality | Tests, security, a11y, performance | Quality gates pass; audit clean |
| 12 | Production Release | Deployment, onboarding, release notes | Production deployment documented and repeatable |

## Phase 0 — Product Foundation (current)

Deliverables:

- [x] Repository scaffold (npm workspaces monorepo)
- [x] Initial README, LICENSE, .gitignore, .gitattributes, .editorconfig
- [x] Repository validation tooling + CI workflow
- [x] ARCHITECTURE.md and detailed architecture documents
- [x] Architecture Decision Records
- [x] CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
- [x] GitHub issue templates, PR template, CODEOWNERS
- [x] Publish repository to a remote and enable branch protection

## Phase 1 — Application Foundation (current)

- [x] Initialize `apps/web` (Vite + React) and `apps/api` (Express).
- [x] Wire environment configuration (Zod-validated) and structured logging.
- [x] API error handling with request IDs and a stable error envelope.
- [x] Database connection layer with health endpoint and readiness probe.
- [x] Frontend shell with routing, theming, API client and health dashboard.
- [x] Smoke tests for the health endpoint and frontend boot (17 tests).
- [x] Shared ESLint config and CI quality gate (validate, lint, test, build).
- [ ] Auth-ready API client (token injection + 401 refresh) — Phase 3.

## Phase 2 — Database (current)

- [x] Define migration tooling and baseline schema.
- [x] Implement identity, organization, project, github and analytics tables.
- [x] Seed scripts for local development.
- [x] Document indexes, constraints and ERD (see `docs/architecture/data-model.md`).

## Phase 3 — Authentication (current)

- [x] Registration, login, logout, email verification, password reset.
- [x] JWT access + refresh token rotation with reuse detection.
- [x] RBAC roles and permission matrix.
- [x] Rate limiting on auth endpoints.
- [x] Test suite covering happy paths and security failures.
- [ ] Email provider wiring for production deliveries (dev links are
      returned/logged locally).

## Phase 4 — Project Management (current)

- [x] Projects, tasks, issues, labels and comments with full validation.
- [x] Milestones and a kanban board (status columns, quick-add, drag-to-move
      persisting `position`).
- [x] Roadmap view grouping tasks by milestone (plus a backlog).
- [x] Filtering, search, sorting and pagination.
- [x] Activity history and audit events.
- [x] Task dependencies (add/list/remove, self/foreign-project and
      cycle-producing dependencies rejected).

## Phase 5 — GitHub (current)

- [x] GitHub OAuth connection with encrypted token storage.
- [x] Repository import and metadata sync.
- [x] Branches, commits, pull requests and issues views.
- [x] Webhook registration with signature verification and retries.

## Phase 6 — Analytics (current)

- [x] Organization analytics API: overview, velocity, health, developers and
      repository activity endpoints (aggregated from PRs, tasks, issues, code
      reviews and repositories).
- [x] Weekly `developer_metrics` materialization so history persists as team
      snapshots.
- [x] Enriched seed data (historical PRs, done tasks with estimates, completed
      reviews, GitHub logins) so dashboards are meaningful on a fresh database.
- [x] Web analytics dashboard with Recharts (velocity + completion charts,
      health breakdown, contributors, developers and repository tables).
- [x] Analytics integration tests (16) and web client + page tests.
- [ ] Commit-based metrics — commits are not persisted yet; velocity and health
      run on PRs, tasks, issues and reviews until real-time sync lands in
      Phase 7.

## Phase 7 — Real-Time

- [x] Socket.io hub with JWT handshake, server-authorized rooms and presence
      tracking (see `docs/architecture/realtime-architecture.md`).
- [x] Notifications: user inbox, unread badge, mark read, live push on task
      assignment, updates and comments.
- [x] Activity feed: live broadcast of task events per organization.
- [x] Team chat: persisted messages, cursor pagination, typing indicators and
      online presence.
- [x] Live task updates: project and task detail views refresh in real time
      (list, board, detail, comments, activity).
- [x] Web integration tests for notifications, chat and live message delivery.

## Phase 8 — AI Foundation

- [x] FastAPI service with provider-agnostic gateway (see
      `docs/architecture/ai-service-architecture.md`).
- [x] Repository ingestion pipeline (fetch, filter, language detection,
      manifests, chunking, secret redaction, snapshot).
- [x] Embeddings and vector search (pgvector `ai_document_chunks` with HNSW
      index, hybrid retrieval, RAG context assembly).
- [x] AI service API contract and validation (signed job intents, typed job
      results, Pydantic validation).
- [x] Node API ↔ AI orchestration: analysis job submission, status polling,
      signed archive streaming to the AI service.
- [x] pgvector-backed Docker/CI and test coverage for both stacks.

## Phase 9 — AI Features

- [x] AI Repository Analyzer with health scores (4 scored dimensions,
      strengths/risks/recommendations, run-and-poll UI).
- [x] AI Code Review of pull request diffs with severity classification
      (findings, review score and run-and-poll per-PR UI).
- [x] AI Documentation / README generator with preview-and-approve
      (approving a draft commits it to GitHub).
- [x] AI Engineering Assistant grounded in repository context (streamed
      replies scoped to a single repository's indexed chunks).

## Phase 10 — DevOps

- [x] Dockerfiles for api, web, ai and nginx.
- [x] Docker Compose full-stack (postgres, api, web, ai, nginx) with health checks.
- [x] CI pipelines: security audit (npm audit + pip audit) and Docker image builds.
- [x] Nginx reverse proxy with websocket upgrade and static serving.
- [x] Prometheus metrics endpoint (hand-rolled text format, zero dependencies).
- [x] Structured logging via pino with secret redaction.

## Phase 11 — Quality

- [x] Accessibility: skip-to-content, nav landmark, theme toggle aria-label, main id, ErrorBanner role=alert.
- [x] Performance: lazy-loaded pages, Vite manualChunks for vendor splitting.
- [x] 5 a11y landmark tests (web: 89 tests total).
- [x] Security audit: npm audit clean, pip audit clean, wheel+pytest pinned for CVEs.

## Phase 12 — Production Release

- [x] Version bump to v1.0.0 across all packages.
- [x] `docs/deployment/README.md` — full Docker Compose deployment guide.
- [x] `env.production.example` — production secrets template.
- [x] `RELEASES.md` — v1.0.0 release notes (470+ tests, no breaking changes).

---

*Related: [README](./README.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [issue roadmap](./docs/roadmap/issue-roadmap.md)*
