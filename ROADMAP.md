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

## Phase 2 — Database

- Define migration tooling and baseline schema.
- Implement identity, organization, project, github and analytics tables.
- Seed scripts for local development.
- Document indexes, constraints and ERD (see `docs/architecture/data-model.md`).

## Phase 3 — Authentication

- Registration, login, logout, email verification, password reset.
- JWT access + refresh token rotation with reuse detection.
- RBAC roles and permission matrix.
- Rate limiting on auth endpoints.
- Test suite covering happy paths and security failures.

## Phase 4 — Project Management

- Projects, tasks, issues, labels and comments with full validation.
- Milestones, roadmaps and kanban boards.
- Filtering, search, sorting and pagination.
- Activity history and audit events.

## Phase 5 — GitHub

- GitHub OAuth connection with encrypted token storage.
- Repository import and metadata sync.
- Branches, commits, pull requests and issues views.
- Webhook registration with signature verification and retries.

## Phase 6 — Analytics

- Commit/PR/issue/review metrics.
- Project velocity and health dashboard.
- Repository activity views.

## Phase 7 — Real-Time

- Notifications, presence and typing indicators.
- Team chat.
- Live task updates and activity feed.

## Phase 8 — AI Foundation

- FastAPI service with provider-agnostic gateway.
- Repository ingestion pipeline.
- Embeddings and vector search (RAG infrastructure).
- AI service API contract and validation.

## Phase 9 — AI Features

- AI Repository Analyzer with health scores.
- AI Code Review with severity classification.
- AI Documentation / README generator with preview-and-approve.
- AI Engineering Assistant grounded in repository context.

## Phase 10 — DevOps

- Dockerfiles and Docker Compose for the full stack.
- CI/CD pipelines: lint, test, build, security, deploy.
- Health checks, structured logging, monitoring.

## Phase 11 — Quality

- Expand test coverage across all services.
- Security review and dependency audit.
- Accessibility and performance passes.

## Phase 12 — Production Release

- Production configuration and deployment guide.
- Onboarding and demo environment.
- Release notes, versioning and CHANGELOG.

---

*Related: [README](./README.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [issue roadmap](./docs/roadmap/issue-roadmap.md)*
