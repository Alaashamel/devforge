# Security Policy

DevForge treats security as a first-class concern. This page explains how to
report vulnerabilities and what guarantees the project commits to.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately to the maintainers by opening a
[Security Advisory](https://github.com/your-org/devforge/security/advisories/new)
(or email the address listed in the repository description).

When reporting, include:

- Affected component and version/branch.
- Reproduction steps or a minimal proof of concept.
- Impact description and suggested severity.
- Any mitigation you have applied.

We will acknowledge within 72 hours, keep you informed of progress, and
credit reporters (unless anonymity is requested).

## Supported versions

Only the latest release on `main` is supported. During pre-release phases
(Phase 0–11), security fixes land on `main` and ship with the next release.

## Security design principles

These are enforced by the architecture (see [ADR-002](./docs/decisions/ADR-002-authentication-strategy.md)):

- **No secrets in code.** API keys, tokens, passwords, OAuth secrets and
  database credentials exist only in environment variables; the repo is
  scanned for accidental disclosure by CI.
- **Passwords** are hashed with Argon2id; never stored or logged in plain.
- **Tokens** are short-lived JWTs with rotating, reuse-detecting refresh
  tokens, stored hashed.
- **Authorization** is server-authoritative. The frontend mirrors RBAC for UX
  only; every protected route enforces the permission matrix.
- **Input validation** with Zod at every API boundary (SQL injection and
  malformed payloads are handled by parameterized queries + validation).
- **Rate limiting** (Redis-backed) on authentication and AI endpoints.
- **GitHub tokens** are encrypted at rest and only ever used by the API; the
  AI service receives credential-free repository content.
- **Webhooks** are signature-verified; replays are deduped via idempotency
  keys.
- **AI output is never executed.** Structured outputs are validated before
  persistence, and prompt-injection attempts are neutralized in context
  assembly.
- **Headers/CORS:** security headers set on all responses; CORS restricted to
  configured frontend origins.
- **Dependencies** are audited in CI and kept current.

## Secret handling expectations for contributors

- Never commit `.env` files, tokens, or credentials (the `.gitignore` blocks
  them; CI scans for leaks).
- Use environment variables or a secret manager for anything sensitive.
- Redact secrets in screenshots, logs and issues.

## Security in CI

The `validate` workflow scans tracked files for obvious secret patterns. As
the stack grows, CI adds dependency audits and container scanning.

## Disclosure policy

We ask that vulnerabilities be reported privately and not disclosed publicly
until we release a fix. Coordinated disclosure is appreciated.
