# Changelog

All notable changes to DevForge are documented in this file, following
[Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Phase 0 — Product Foundation

Added:

- Repository scaffold: npm-workspaces monorepo (`apps/`, `packages/`,
  `infrastructure/`, `tests/`, `docs/`).
- MIT license, `.editorconfig`, `.gitignore`, `.gitattributes`.
- Repository validation tooling (`npm run validate`) and GitHub Actions
  workflow enforcing structure, config validity and secret hygiene.
- `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` with the 13-phase roadmap.
- Architecture documents: system overview, backend, frontend, AI service,
  real-time, data model (ERD proposal), API design.
- Issue roadmap mapping planned work to all 13 phases.
- Six Architecture Decision Records (database, authentication, AI boundary,
  real-time, monorepo, frontend stack).
- Community documents: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`.
- GitHub issue templates, pull request template and code owners.

### Phase 1 — Application Foundation

Added:

- `apps/api`: Express 5 application with Zod-validated environment
  configuration, graceful shutdown and a dev-only Postgres container
  (Docker Compose).
- Centralized error handling with a stable `{ error }` envelope, request IDs
  (`X-Request-Id`) and structured pino logging with secret redaction.
- Health endpoints: liveness `/api/v1/health` (alias `/live`) and readiness
  `/ready` that reports a 503 "degraded" status when the database is down.
- `apps/web`: Vite + React 19 shell with Tailwind 4 design tokens, a
  dark/light theme persisted via Zustand, routing and a 404 page.
- API client with envelope unwrapping and structured `ApiError`, plus a
  TanStack Query–powered health dashboard with retry-on-error.
- 17 passing tests across the API (Supertest) and web (React Testing
  Library), sharing a Vitest setup.
- Shared ESLint flat config (`@devforge/eslint-config`) covering node and
  browser/JSX workspaces; linting wired into both apps.
- CI "Quality Gate": `npm ci`, validate, lint, test and build on every push
  to `main` and pull requests.
- Root `npm run dev` script running the API and web app concurrently.

Changed:

- Frontend stays plain JavaScript per ADR-006; input validation happens at
  the API boundary with Zod (ADR-006).
- Root `test`/`lint` scripts use the long `--workspaces` flag.
- Removed the now-unneeded `eslint-disable` directive in the error handler.

### Phase 2 — Database

Added:

- `@devforge/database`: versioned migration tooling (`packages/database`) with
  a `schema_migrations` tracking table, transaction-wrapped apply/rollback,
  and `up`/`down` migration modules.
- Migration CLI (`npm run db:migrate` / `db:down` / `db:status` /
  `db:migrate:create`) reading `DATABASE_URL`, plus idempotent local seed data
  (`npm run db:seed`).
- Seven baseline migrations implementing the data model: identity, orgs,
  projects/work items, GitHub integration, collaboration, AI, analytics
  (29 tables, uuid PKs, FK indexes, constrained text and soft deletes).
- Test suite for the runner (ordering, idempotency, rollback, atomic
  rollback on failure) plus schema assertions against a dedicated
  `devforge_test` database.
- Postgres service container in CI so migration tests run in the Quality
  Gate.

Changed:

- Dev Postgres binds host port `5433` (keeps other local projects using
  `5432` untouched); `DATABASE_URL` defaults and `.env.example` updated.

### Phase 3 — Authentication

Added:

- `apps/api` auth module (`/api/v1/auth`): registration, email verification,
  login, logout, refresh, forgot/reset password and `GET /me`, all behind
  Zod request validation with a strict body policy.
- Argon2id password hashing (`@node-rs/argon2`) with tunable work factors.
- Short-lived HS256 access tokens (`jose`, default 15m) as bearer JWTs and
  opaque rotating refresh tokens (7d) stored as SHA-256 hashes server-side.
- Refresh token rotation with **reuse detection**: replaying a rotated or
  revoked token revokes the whole token family for the user.
- RBAC permission matrix (owner/admin/maintainer/developer/viewer) with a
  `requireAuth` + `authorize(permission)` middleware stack; org roles and
  project roles compose with the more permissive winning (ADR-002).
- Per-route rate limiting on all auth endpoints (in-memory sliding window,
  `429 RATE_LIMITED` with `Retry-After`; Redis-backed store planned for the
  real-time phase).
- Auth integration tests (happy + failure paths) against a dedicated
  `devforge_test` database: 63 API tests total, plus unit tests for the
  permission matrix, JWT/token utilities and the rate limiter.
- Web auth flow: login/register/verify-email/forgot-password/reset-password
  pages, a session store (refresh token persisted, access token in memory),
  an `AuthGuard` for protected routes, and API-client token injection with
  single-retry on 401 refresh.

Security notes:

- Email delivery is not wired yet: in development the verification/reset
  links are returned in the register response and logged; production
  requires an email provider and never exposes tokens in responses.

### Phase 4 — Project Management

Added:

- `apps/api` organization module (`/api/v1/organizations`): list organizations
  the caller belongs to, with the caller's computed role.
- Projects module (`/api/v1/organizations/:orgId/projects`): full CRUD with
  a `key` (2–6 `[A-Z0-9]`), optional `defaultPriority`, soft-archived
  projects, member management (`PUT`/`DELETE …/members/:userId`) and
  `memberCount`/`taskCount` plus `taskCounts.byStatus` aggregates.
- Milestones module (`…/milestones`): CRUD with `planned`/`active`/`done`
  status, `YYYY-MM-DD` due dates and `taskCount`.
- Labels module (`…/labels`): CRUD with hex color validation, per-project
  unique names (`409 CONFLICT` on duplicates) and `taskCount`.
- Tasks module (`…/tasks`): CRUD with status/priority/type, assignee and
  milestone references, optional `parentId`, `dueDate`, `estimate`, plus
  `?status=`/`?priority=`/`?type=`/`?assigneeId=`/`?milestoneId=`/`?label=`
  filters, `?q=` search, `?sort=` and pagination.
- Task comments (`…/tasks/:taskId/comments`): create/list/update/delete.
- Task label replacement (`PUT …/tasks/:taskId/labels`) storing `labels[]`
  as `{id, name, color}` in task responses.
- Task activity ledger (`GET …/tasks/:taskId/activity`): actor-scoped audit
  events (`created`, `status_change`, `priority_change`, `labels_change`,
  `comment`, `dependency_added`, …) written in the same transaction as the
  change.
- Task dependencies (`…/dependencies`): list (`dependsOn`/`dependedOnBy`),
  add and remove, rejecting self/foreign-project dependencies and any
  dependency that would close a cycle (`409`, graph traversal over the
  project's edges).
- RBAC wired across the modules: `projects.create`, `projects.manage`,
  `projects.delete`, `tasks.manage` and `project.view` enforce the composed
  org/project role (more permissive wins).
- Web UI: an org selector in the app shell (persisted via Zustand), a
  Projects list with create/archive, a project detail page with a kanban
  board (quick-add tasks, status columns), milestones and labels, and a task
  detail page with edit form, label chips, comments, activity and
  dependencies.
- Web API client methods for all of the above plus 6 new client tests;
  `listOrganizations`/`listProjects`/… support nested paths, query-string
  building and 204 handling.
- Kanban drag-to-move: tasks can be dropped on a column (append) or before a
  specific card (midpoint `position` between neighbors), persisted via
  `PATCH …/tasks/:taskId` with an optimistic board update.
- Roadmap view: a Board/Roadmap toggle on the project page grouping tasks by
  milestone (ordered by status then due date) with a backlog bucket.
- Pure board/roadmap helpers (`lib/board.js`, `lib/roadmap.js`) with 7 unit
  tests.
- Seed data upgraded to RFC-4122 v4-compatible deterministic UUIDs so seeded
  users/orgs pass `uuid` validation in request bodies.

Changed:

- `apps/api/test` suites run serially (`fileParallelism: false`) because
  they share the `devforge_test` database.
- Task label aggregation returns a single JSONB array of
  `{id, name, color}` instead of parallel distinct arrays (NULL-safe).
- pg `date` columns are mapped back to `YYYY-MM-DD` strings in responses so
  dates are timezone-independent.
- Test counts: 100 API tests (9 files), 30 web tests, 15 database tests.

### Phase 5 — GitHub

Added:

- `apps/api` GitHub module (`/api/v1/github`): OAuth connect/disconnect flow —
  `POST /oauth/begin` issues a URL with an HMAC-signed state (10-min TTL),
  `GET /oauth/callback` exchanges the code for a token and 302-redirects back
  to the web app (`?github=connected|error`), `GET /connection` reports the
  linked GitHub account, `POST /disconnect` clears it.
- Encrypted token storage: access/refresh tokens are AES-256-GCM encrypted
  (`v1:iv:tag:ciphertext` envelope, fresh IV per write) with a
  SHA-256-derived key; token expiry is tracked and a GitHub 401 marks the
  connection expired (`409 GITHUB_TOKEN_EXPIRED`) so clients can reconnect.
- GitHub REST client (`createGithubClient`) with exponential backoff on 5xx,
  rate-limit handling (waits on `x-ratelimit-reset`/`retry-after`, capped 60s)
  and short-circuiting on 401; user/repo/branch/commit/PR/issue/webhook
  methods.
- Repository module (`/api/v1/organizations/:orgId/repositories`): import a
  repo by `owner/name` (transactional upsert + pull-request cache), list/get,
  `POST …/:repoId/sync` to refresh metadata and PRs, and delete. Branches,
  commits and issues are live views against the GitHub API; pull requests are
  served from the local `pull_requests` table with filtering/pagination.
- Webhook module (`…/:repoId/webhooks`): create (random 32-byte secret,
  URL derived from `API_BASE_URL`) and delete (tolerates a GitHub 404).
  Inbound `POST /api/v1/webhooks/github/:repoId` reads the raw body (registered
  before the JSON parser), verifies `x-hub-signature-256` via `timingSafeEqual`,
  acks `ping` and re-syncs the repo + PRs on `push`/`pull_request`.
- RBAC: repository reads need `project.view`; import/sync/delete/webhook
  writes need `repos.manage` (owner/admin/maintainer).
- Migration `0008_github_unique_connection` (unique index on
  `github_connections(user_id)`) enabling the per-user upsert.
- Web UI: a Repositories page (Connect GitHub via OAuth redirect, import
  `owner/repo`, card grid with sync/remove, `?github=connected|error` notice)
  and a repository detail page with overview plus pull-requests, branches,
  commits (branch selector), issues and webhooks tabs; "Repositories" is now
  a primary nav item.
- Web API client methods for the GitHub endpoints plus 7 new client tests.
- Test counts: 136 API tests (12 files), 37 web tests, 15 database tests.

### Phase 6 — Analytics

Added:

- `apps/api` analytics module
  (`/api/v1/organizations/:orgId/analytics`): overview (counts, additions/
  deletions, completion ratio, top contributors, recently merged), velocity
  (Monday-aligned weekly buckets over a 1–52 week window for merged PRs, done
  tasks, closed issues and completed reviews), health (task completion, merge
  rate, issue close rate and review coverage re-weighted by available
  components into a 0–100 score with a healthy/degraded/critical/no-data
  status), developers (in-window task + PR aggregation per team member) and
  repository summaries, plus per-repository activity
  (`…/analytics/repositories/:repoId/activity` with monthly, recent and
  review-by-status breakdowns).
- `developer_metrics` materialization: the developers endpoint upserts a
  weekly per-member snapshot (tasks completed, velocity points, PRs merged,
  health score) so history persists as the team changes.
- Analytics read endpoints gated by `project.view`, so viewers can render the
  dashboard.
- Enriched seed data: GitHub logins for seeded developers, 8 historical pull
  requests (open/merged/closed over ~10 weeks), 6 done tasks with estimates,
  an issues-type task, and a completed code review — dashboards are meaningful
  on a fresh database.
- Web analytics dashboard (`/analytics`, lazy-loaded): Recharts velocity area
  chart and completion bar chart, health breakdown with status pills, top
  contributors, recently-merged list, developers and repository activity
  tables; "Analytics" promoted to the primary navigation.
- Web API client methods for all six analytics endpoints plus 3 new client
  tests; `recharts` added as a dependency with the page code-split out of the
  main bundle.
- Test counts: 152 API tests (13 files), 42 web tests, 15 database tests.

Notes:

- Commits are not persisted yet, so velocity/health run on PRs, tasks, issues
  and reviews; commit-based metrics are expected once real-time sync lands in
  Phase 7.
- `developer_metrics.period` is a stripped `date` column; reads use
  `to_char` so periods are timezone-independent.

### Phase 7 — Real-Time

Added:

- Socket.io hub (`apps/api/src/modules/realtime`): JWT handshake on connect
  (reuses the `accessTokens` HS256 verifier), server-authorized rooms
  (`user:{id}`, `org:{id}`, `project:{id}`, `task:{id}`, `chat:{orgId}`) with
  DB-backed membership checks on `room:join`, presence tracking with a 90s TTL
  sweep and throttled `presence:update` broadcasts, throttled `chat:typing`
  (2s), `emitToUser`/`emitToRoom`/`getOnlineUserIds` helpers, and an
  `attach({ server })` integration attached to the same HTTP server.
- Notifications module (`/api/v1/notifications`): list, unread count, mark
  read and mark-all-read, plus a `notify` helper that persists and pushes
  `notification:new` to the target user's room. Task service now notifies the
  assignee on assignment (and re-assignment) and the assignee + reporter on
  comments.
- Activity module (`/api/v1/organizations/:orgId/activity`): live feed listing
  with `activity:new` broadcast to the org room.
- Chat module (`/api/v1/organizations/:orgId/chat`): persisted
  `chat_messages` (migration `0009_chat`, body 1–2000 chars, cursor
  pagination) with `chat:message` broadcast to the `chat:{orgId}` room.
- Tasks service events: post-commit `task:created`/`task:updated` (with
  `changes` diff) to the `project:` room and `task:comment` to the `task:`
  room; all broadcasts go through a `safeEmit` wrapper so a socket failure can
  never fail an already-committed request.
- Organizations module: `GET /:orgId/members` for presence UI.
- Web socket client (`apps/web/src/services/socket.js`): connect/disconnect
  that re-authenticates on token change, server-authorized `joinRoom`/`leaveRoom`
  with ack, `emitEvent` and `onRealtime`.
- Web notifications: unread badge + dropdown in the app shell (mark read on
  click, mark all read, relative timestamps), a Zustand store fed live by
  `notification:new`.
- Web team chat (`/chat`): message history + live appends, dedup by id,
  typing indicators, and an org-members sidebar with online/offline dots from
  presence heartbeats.
- Live task updates: project detail and task detail pages join realtime rooms
  and invalidate their queries on `task:created`/`task:updated`/`task:comment`,
  so lists, the board, details, comments and activity refresh without reloads.
- Test counts: 163 API tests (14 files — 11 new realtime integration tests),
  50 web tests (8 new), 15 database tests.

### Phase 8 — AI Foundation

Added:

- `apps/ai` FastAPI service (Python): pydantic-settings config, liveness +
  readiness routers, a provider-agnostic model gateway (`providers/`) with
  OpenAI, Anthropic and local adapters plus a deterministic offline
  `hashing_embed` embedder, and pipeline orchestration
  (`pipelines/ingest`, `pipelines/analysis`, `pipelines/scoring`).
- Repository ingestion (`app/ingestion/`): tarball fetch with percent-decoded
  paths, filter rules (ignores `node_modules`, build output, binaries, VCS),
  per-extension language detection, dependency-manifest parsing, chunking,
  secret scanning/redaction and a normalized repository snapshot.
- Embeddings + vector search: migration `0010_ai_vectors` enables pgvector
  (`ai_document_chunks` with a 1536-dim HNSW `vector_cosine_ops` index plus
  content and repository-id indexes); hybrid keyword + vector retrieval with
  token-budgeted context assembly (`app/context/`).
- AI job contract: the API submits a bounded **job intent**
  (`POST {AI_SERVICE_URL}/jobs/{jobId}` with an HMAC job token), the service
  returns typed, Pydantic-validated results and updates `ai_jobs`; secret
  redaction runs before any content reaches a model.
- Node API orchestration (`apps/api/src/modules/ai/`): `createAnalysis`
  (queues `ai_jobs`, signs job + archive tokens, submits the intent), job
  status polling, analyses listing, and a **signed archive stream**
  (`GET /api/v1/ai/archive/:repoId?token=…`) that streams the GitHub tarball
  to the AI service so credentials never leave the API. Tokens
  (`tokens.js`) mirror `apps/ai/app/auth.py` exactly (HMAC-SHA256, base64url,
  expiring).
- GitHub client tarball download (`downloadTarball` with default-branch and
  slash-encoded refs) and service method `downloadRepositoryArchive`.
- AI environment config (`AI_SERVICE_URL`, `AI_JOB_SECRET` with a production
  explicit-secret guard, `AI_JOB_TTL_SECONDS`, `AI_ARCHIVE_TTL_SECONDS`) and
  `.env.example` entries; root scripts `npm run ai:dev`, `npm run ai:test`,
  `npm run ai:lint`.
- CI: the Quality Gate now provisions `pgvector/pgvector:pg16`, installs the
  AI service (`pip install -e "./apps/ai[dev]"`), runs `ruff check apps/ai`
  and `pytest apps/ai` (with `AI_TEST_DATABASE_URL`).
- Docker Compose postgres switched to the pgvector image.
- Validator: secret-scan exempts intentional test fixtures via a marker
  comment and skips `__pycache__`/`.pyc` files.
- Test counts: 185 API tests (16 files — 19 new AI/archive tests), 92 AI
  pytest tests (16 files), 50 web tests, 15 database tests.

### Phase 9 — AI Features

Added:

- Repository Analyzer: new `analyzer` analysis type (migration `0011` extends
  the `ai_analyses` type CHECK). The AI service scores a repository across
  four dimensions — architecture, code quality, security, documentation —
  each with a 0–100 score, summary, strengths, risks and recommendations.
  Reports are Pydantic-validated (`AnalyzerReport`): the dimension set is
  enforced and normalized to canonical order, and the `overall` score is a
  deterministic mean of the dimension scores (`health` reuses the existing
  `score_snapshot` heuristic).
- AI service: `analyzer` prompt + `validate_analyzer_report` in
  `pipelines/analysis.py` (raises `AnalysisError` on invalid output), tests
  in `tests/test_analyzer.py` (7 tests).
- Node API: `analyzer` accepted for analysis jobs and a
  `GET /organizations/:orgId/ai/analyses/:analysisId` route to read a stored
  report (`service.getAnalysis`).
- Web: repository detail page gains an "analysis" tab — run an analyzer job,
  poll `ai/jobs/:id` to completion and render the overall health score plus
  per-dimension cards (`ai-analysis-tab.jsx`); API client methods
  `createAnalysis`, `listAnalyses`, `getAnalysis`, `getAiJobStatus`.
- AI Code Review: new `code_review` analysis type (pull request required).
  The API fetches the PR diff from GitHub (`getPullRequestDiff` using the
  `application/vnd.github.diff` Accept header, service method
  `downloadPullRequestDiff`) and submits it inline in the job payload,
  skipping the ingestion/archive flow entirely. The AI service classifies
  findings INFO → CRITICAL (`ReviewFinding`/`ReviewReport`, normalized to
  canonical severity order, `severity_counts` derived), computes a
  deterministic review score (per-finding penalties — critical 30, high 15,
  medium 6, low 2, floored at 0) and persists `pull_request_number`,
  `files_changed`, `additions` and `deletions` top-level in the report.
- Node API: `pullRequestNumber` validated on `code_review` jobs (400
  `VALIDATION_ERROR` when missing) and `GET .../ai/analyses` gains `type` and
  `pullRequestNumber` filters.
- Web: per-PR "AI review" panel on the repository pull requests tab
  (`ai-code-review.jsx`) — run-and-poll job handling, severity badges,
  review score, findings with file:line locations and suggestions, and an
  empty state for pull requests without a review.
- Test counts: 193 API tests (16 files), 109 AI pytest tests (19 files),
  66 web tests (9 files — new `ai-code-review.test.jsx`), 15 database tests
  (runner rollback covers migration `0011`).
- AI Documentation/README generator: new `docs` and `readme` analysis types
  emit validated markdown files (`{summary, files:[{path, content, note}]}`).
  The AI service validates drafts in `validate_docs_report` — `.md` only, no
  absolute/relative paths, exactly one `README.md` for readme, `docs/`
  prefix for docs, deterministic ordering — and persists `repository` meta
  (name, file_count, languages) plus a per-file `score`.
- Node API: `POST /organizations/:orgId/ai/analyses/:analysisId/approve`
  commits a generated file to GitHub via the Contents API (`getFile` +
  `createOrUpdateFile` in the GitHub client, upserting with the existing
  file's `sha`). Approvals are recorded in `report.approvals` and rejected
  when the type isn't docs/readme (400) or the path isn't in the report
  (400); out-of-date commits map to 409.
- Web: "docs" tab on the repository detail page (`ai-docs-tab.jsx`) — README
  vs docs toggle, run-and-poll generation, draft previews with per-file
  Approve & commit actions that disappear once committed.
- Test counts: 203 API tests (16 files), 125 AI pytest tests (20 files),
  76 web tests (10 files — new `ai-docs-tab.test.jsx`), 15 database tests.
- AI Engineering Assistant: migration `0012_ai_assistant_conversations`
  scopes conversations to a repository (`ai_conversations.repository_id`,
  cascade delete + index). The AI service adds streaming to the provider
  gateway and the OpenAI/Anthropic/local adapters (SSE delta parsing) and a
  stateless assistant pipeline (`pipelines/assistant.py`) that hybrid-
  retrieves a single repository's chunks, insulates excerpts as
  `<untrusted>` data and streams replies via `POST /assistant/stream` (HMAC
  job token) with `sources` / `delta` / `done` / `error` SSE events.
- Node API: repository-scoped conversation CRUD (`GET/POST/DELETE
  /ai/conversations`, `GET /ai/conversations/:id/messages`) and
  `POST /ai/conversations/:id/stream`, which persists the user message,
  relays full history to the AI service, streams SSE deltas back and
  persists the assistant reply with its `sources` only on success.
- Web: "assistant" tab on the repository detail page (`ai-assistant-tab.jsx`)
  — conversation list (new/delete), message thread with source chips, and a
  live-streaming reply box that renders deltas as they arrive.
- Test counts: 216 API tests (16 files), 146 AI pytest tests (21 files —
   new `test_assistant.py`), 84 web tests (11 files — new
   `ai-assistant-tab.test.jsx`), 15 database tests (runner covers migration
   `0012`).

### Phase 10 — DevOps

Added:

- Dockerfiles: `apps/api/Dockerfile` (multi-stage node:20-alpine),
  `apps/web/Dockerfile` (Vite build + nginx:alpine), `apps/ai/Dockerfile`
  (python:3.13-slim with pip install), `infrastructure/nginx/Dockerfile`
  (nginx:alpine).
- `docker-compose.yml`: full 5-service stack (postgres/pgvector, api, web,
  ai, nginx) with health checks, build args, and environment wiring.
- `infrastructure/nginx/nginx.conf`: reverse proxy routing `/api/v1/*` to the
  API, `/socket.io/*` with websocket upgrade headers, `/metrics` to the API,
  and static file serving from the web build.
- CI workflows: `.github/workflows/security.yml` (npm audit + pip audit on
  schedule and push to main), `.github/workflows/docker.yml` (build all 4
  Docker images on push/PR to main).
- `.dockerignore` excluding node_modules, __pycache__, .git, test data and
  build artifacts from Docker contexts.
- Prometheus metrics module (`apps/api/src/modules/metrics/`): hand-rolled
  text format 0.0.4 registry with Counter, Histogram and Gauge classes,
  Express middleware for request duration histograms, and `GET /metrics`
  endpoint exposing API and process metrics.
- 4 metrics unit tests covering registry, middleware and route integration.
- `apps/ai/pyproject.toml`: `wheel>=0.46.2` (CVE-2026-24049 fix),
  `pytest>=9.0.3` (PYSEC-2026-1845 fix).
- Test counts: 220 API tests (17 files — 4 new metrics tests), 145 AI
  pytest tests (21 files), 84 web tests, 15 database tests.

### Phase 11 — Quality

Added:

- Accessibility improvements to the web app: skip-to-content link with
  `#main-content` target, `<nav aria-label="Main navigation">`, theme toggle
  `aria-label="Toggle theme"`, `<main id="main-content">` landmark, and
  ErrorBanner `role="alert"` for screen reader validation announcements.
- 5 a11y landmark tests (`apps/web/src/test/a11y.test.jsx`) verifying
  skip link, nav landmark, main id, theme toggle aria-label, and error
  banner role.
- Performance: lazy-loaded 5 pages (Repositories, RepositoryDetail,
  TaskDetail, Chat, Analytics) via `React.lazy` with Suspense wrappers,
  splitting each page into its own chunk.
- Vite `manualChunks` configuration extracting vendor-react (react,
  react-dom, react-router-dom), vendor-query (@tanstack/react-query), and
  vendor-charts (recharts) into separate bundles.
- Updated `app-shell.test.jsx` for the new theme toggle `aria-label`
  selector.
- Security: `npm audit --audit-level=high` clean, `python -m pip_audit`
  clean, `wheel>=0.46.2` and `pytest>=9.0.3` pinned for CVE remediation.
- Test counts: 220 API tests (unit), 89 web tests (12 files — 5 new a11y
  tests), 145 AI pytest tests.

### Phase 12 — Production Release (v1.0.0)

Added:

- Version bump to v1.0.0 across all packages: root `package.json`,
  `apps/api/package.json`, `apps/web/package.json`, `apps/ai/pyproject.toml`,
  API root handler `version` field, AI service metadata, and web app shell
  footer.
- `docs/deployment/README.md`: full production deployment guide covering the
  Docker Compose stack, health checks, Prometheus monitoring, TLS
  termination, backups and restore, horizontal scaling notes, and
  troubleshooting table.
- `env.production.example`: production environment template with all required
  secrets explicitly documented.
- `RELEASES.md`: v1.0.0 release notes covering all features, 470+ test
  summary, and no breaking changes.

