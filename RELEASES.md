# Releases

## v1.0.0 — Production Release (August 2026)

DevForge reaches v1.0.0 with a complete AI-powered developer platform and
engineering workspace.

### Highlights

- **Project management** — Kanban boards, milestones, roadmaps, task
  dependencies, labels and full-text search.
- **GitHub integration** — OAuth connection, repository import/sync,
  pull request views, commit history and webhook-driven updates.
- **Real-time collaboration** — Socket.io-powered notifications, team
  chat, typing indicators and online presence.
- **Analytics dashboard** — Velocity, health, contributor breakdowns
  and repository activity, with weekly developer metrics snapshots.
- **AI repository analyzer** — Architecture, code quality, security and
  documentation scores with strengths, risks and recommendations.
- **AI code review** — Severity-classified findings with a review score,
  run directly on pull request diffs.
- **AI documentation generator** — Preview-and-approve README and docs
  generation; approvals commit directly to GitHub.
- **AI engineering assistant** — Streamed, repo-scoped Q&A grounded in
  your indexed repository chunks.
- **DevOps** — Docker Compose full-stack (postgres, api, web, ai, nginx),
  Prometheus metrics, CI quality gate with security auditing.

### Test coverage

470 passing tests across four stacks:

| Stack | Tests | Files |
| --- | --- | --- |
| API (Express) | 220 | 17 |
| AI service (FastAPI) | 146 | 21 |
| Web (React) | 89 | 12 |
| Database | 15 | 2 |
| **Total** | **470** | **52** |

### Breaking changes

None — first stable release.

### Acknowledgements

Built incrementally across 13 phases with a CI quality gate enforcing
lint, test, build and structure validation on every push.
