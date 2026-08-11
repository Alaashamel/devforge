# ADR-005: Monorepo Structure

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [ARCHITECTURE](../ARCHITECTURE.md#3-application-boundaries)

## Context

DevForge consists of a React SPA, an Express API, a Python AI service, shared
packages and infrastructure. These need to be developed, versioned and
reviewed together while remaining independently deployable.

## Decision

- **npm workspaces monorepo**: `apps/*` (web, api, ai, docs) and
  `packages/*` (ui, shared, database, config, eslint-config) in one
  repository.
- Cross-app sharing goes through `packages/`; the AI service (Python) is
  co-located but not part of npm workspaces — it has its own `pyproject.toml`
  and dependency tooling.
- Boundaries documented in [ARCHITECTURE](../ARCHITECTURE.md): no module may
  reach across application boundaries to duplicate domain logic.

## Consequences

- One PR can span frontend + backend + docs with full context.
- Shared packages prevent drift (schemas, config, UI tokens).
- The Python service is managed with its own tooling, avoiding npm/Python
  toolchain entanglement.

## Alternatives considered

- **Separate repositories per app:** rejected — cross-cutting changes become
  multi-repo choreography.
- **Single flat app:** rejected — no clean boundary for the AI service and
  shared packages.
