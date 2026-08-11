# Contributing to DevForge

Thanks for considering a contribution. This guide defines how the project is
developed so contributions stay consistent and reviewable.

## Code of Conduct

Read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Participation is governed by
it.

## Getting started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone git@github.com:<you>/devforge.git
   cd devforge
   ```
3. Set the upstream remote:
   ```bash
   git remote add upstream git@github.com:your-org/devforge.git
   ```
4. Install tooling (Node >= 20, npm >= 10; Python 3.12+ for the AI service
   in later phases).
5. Run the validation gate:
   ```bash
   npm install
   npm run validate
   ```

> The runnable local development setup (database, API, web) arrives in
> **Phase 1**. Until then the validation gate is the only local check.

## Development workflow

DevForge follows **issue-driven development**:

1. **Find or create an issue.** Significant work must have an issue with
   requirements and acceptance criteria. Use the issue templates.
2. **Create a branch** off `main` (see [Branch strategy](#branch-strategy)).
3. **Implement** in small, reviewable steps.
4. **Test.** Add or update tests for your change. Never skip tests for
   important functionality.
5. **Document.** Update relevant docs (`docs/`, `CHANGELOG.md`, API docs)
   when behavior changes.
6. **Verify quality gates** — see below.
7. **Open a pull request** using the PR template.
8. **Respond to review.** Address findings in additional commits; do not
   rewrite history until the PR is approved.
9. After merge and approval, the branch is deleted and the issue closed.

## Branch strategy

Never commit directly to `main`.

| Kind | Pattern | Example |
| --- | --- | --- |
| Feature | `feature/<name>` | `feature/authentication` |
| Bug fix | `fix/<name>` | `fix/webhook-validation` |
| Refactor | `refactor/<name>` | `refactor/auth-service` |
| Docs | `docs/<name>` | `docs/architecture` |
| CI/DevOps | `ci/<name>` | `ci/backend-tests` |
| Chore | `chore/<name>` | `chore/deps-update` |

## Commit conventions

Commits must be **atomic** and follow
[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): implement refresh token rotation
fix(github): handle expired OAuth tokens
test(auth): add refresh token integration tests
refactor(api): extract centralized error handler
perf(repositories): add repository metadata caching
docs(architecture): document service boundaries
ci(actions): add backend test workflow
security(api): add request rate limiting
```

Rules:

- One logical change per commit.
- Do not mix unrelated work.
- No meaningless commits (`update`, `wip`, `fix`, `changes`).
- No fake or empty commits.

## Pull requests

Small PRs review faster. Use the
[PR template](./.github/PULL_REQUEST_TEMPLATE.md). Before opening a PR,
confirm the checklist: feature works, edge cases handled, validation and
errors handled, tests added, security reviewed, performance considered,
docs updated, no secrets committed, lint/test/build pass.

## Quality gates

Before a change is complete:

- [ ] Feature works
- [ ] Edge cases handled
- [ ] Validation implemented
- [ ] Errors handled
- [ ] Tests added and passing
- [ ] Security reviewed
- [ ] Performance considered
- [ ] Documentation updated
- [ ] API documented (when applicable)
- [ ] UI accessible (when applicable)
- [ ] No secrets committed
- [ ] Lint passes
- [ ] Tests pass
- [ ] Build passes

## Architecture decisions

Read [ARCHITECTURE.md](./ARCHITECTURE.md) and the
[ADRs](./docs/decisions/) before making structural changes. Significant new
decisions must be added as a new ADR.

## Testing

| Layer | Tooling | Coverage expectation |
| --- | --- | --- |
| Web | Vitest + React Testing Library | unit + component |
| API | Vitest + Supertest | unit + integration |
| AI | pytest | unit + integration |
| E2E | Playwright | critical journeys |

Run the relevant suite before pushing. CI runs lint → test → build →
security checks.

## Reporting issues

Use the issue templates. Good reports include: environment, reproduction
steps, expected vs actual behavior, and (for bugs) a minimal repro.

## Security

Read [SECURITY.md](./SECURITY.md). **Do not** open a public issue for
security vulnerabilities — report privately as described there.
