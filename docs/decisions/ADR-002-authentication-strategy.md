# ADR-002: Authentication Strategy

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [api-design](../architecture/api-design.md)

## Context

DevForge requires secure, scalable authentication: registration, login,
email verification, password reset, OAuth (GitHub) and fine-grained
authorization across organizations and projects.

## Decision

- **Passwords:** hashed with Argon2id.
- **Access tokens:** short-lived JWTs (15 min) sent as `Authorization: Bearer`.
- **Refresh tokens:** opaque, rotating, stored **hashed** server-side with a
  rotation chain and **reuse detection** (a replayed token revokes the family).
- **Sessions:** refresh tokens are the session primitive; Redis may cache
  session metadata but PostgreSQL is authoritative.
- **OAuth:** GitHub OAuth for repository integration only (scopes:
  `repo`, `read:org`, `read:user`).
- **RBAC:** five roles — Owner, Admin, Maintainer, Developer, Viewer —
  enforced by middleware using the permission matrix in
  [api-design](../architecture/api-design.md#5-rbac).
- Verification/reset tokens are single-use, hashed, and expire (24h / 1h).

## Consequences

- Rotation + reuse detection limits token theft windows.
- Short-lived access tokens reduce blast radius while keeping the SPA
  stateless on the API side.
- RBAC stays centralized and server-authoritative; the frontend mirrors it
  only for UX.

## Alternatives considered

- **Session cookies only:** rejected — the SPA + API + mobile-future shape
  favors bearer tokens, with CSRF considerations avoided entirely.
- **Single long-lived JWT:** rejected — revocation is hard; rotation model
  chosen instead.
