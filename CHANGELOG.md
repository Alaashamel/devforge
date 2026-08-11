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
