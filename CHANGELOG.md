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
