# DevForge

**AI-powered developer platform and engineering workspace.**

DevForge combines project management, GitHub integration, real-time
collaboration, engineering analytics and AI-assisted development into a single
cohesive workspace for software teams.

> **Status: Phase 0 — Product Foundation.** The repository is under active
> development. There is no runnable application yet; Phase 1 introduces the
> frontend and API foundations.

---

## Why DevForge exists

Teams today stitch together a project tracker, a code host, an incident tool,
an AI assistant and a docs site — and lose context in the seams. DevForge is a
single engineering workspace where:

- Project work (projects, issues, tasks, milestones, roadmaps) lives next to the
  code it tracks (GitHub repositories, PRs, activity).
- Engineering health is measurable, not vibes — analytics and AI analysis turn
  repository and team activity into actionable insight.
- AI is a first-class engineer: repository analysis, code review, documentation
  generation and an engineering assistant grounded in your actual project.
- Teams collaborate in real time with notifications, presence and live updates.

## Core modules

| Module | Description |
| --- | --- |
| **Identity & RBAC** | Registration, login, JWT + refresh tokens, email verification, password reset, GitHub OAuth, role-based access control (Owner / Admin / Maintainer / Developer / Viewer). |
| **Organizations & Teams** | Organizations, teams, members, invitations, permissions, project membership. |
| **Project Management** | Projects, tasks, issues, labels, comments, milestones, roadmaps, kanban boards, filters, search, activity history. |
| **GitHub Integration** | Connect GitHub, import repositories, branches, commits, PRs, issues, contributors, webhooks. |
| **AI Repository Analyzer** | Ingests a repository and produces architecture, code quality, security, documentation, maintainability and testing scores with actionable recommendations. |
| **AI Code Review** | Reviews GitHub pull requests, classifies findings (INFO → CRITICAL) and explains what, why, where and how to fix. |
| **AI Documentation Engine** | Generates READMEs, API docs, architecture docs, setup guides and changelog drafts — with preview and approval, never silent overwrites. |
| **AI Engineering Assistant** | Answers questions about project structure, issues, docs and architecture using RAG over your repository. |
| **Real-Time Collaboration** | Team chat, notifications, online presence, typing indicators, live task updates, activity feed. |
| **Developer Analytics** | Commits, PRs, issues, reviews, velocity and project health — built to reveal engineering health, not vanity metrics. |
| **DevOps & Observability** | Docker Compose, CI/CD, health checks, structured logging, monitoring. |
| **Documentation Platform** | Markdown workspace with search, categories, versioning and navigation. |

## Technology stack

- **Frontend:** React (JavaScript), Vite, Tailwind CSS, React Router, TanStack
  Query, Zustand, React Hook Form, Zod, Socket.io Client.
- **Backend:** Node.js, Express, REST, Socket.io, JWT, PostgreSQL, Redis.
- **AI service:** Python, FastAPI, provider-agnostic model gateway, RAG.
- **DevOps:** Docker, Docker Compose, GitHub Actions, Nginx.

## Repository layout

```
apps/             web (React SPA), api (Express), ai (FastAPI), docs
packages/         shared libraries: ui, shared, database, config, eslint-config
infrastructure/   docker, nginx, monitoring, scripts
tests/            end-to-end and cross-service tests
docs/             architecture, api, database, ai, deployment, decisions, roadmap
.github/          workflows, issue templates, PR template, code owners
```

## Development roadmap

DevForge is built in 13 incremental phases. Each phase leaves the repository in
a working state.

| Phase | Focus |
| --- | --- |
| 0 | Product foundation (this phase) |
| 1 | Application foundation — runnable web + API locally |
| 2 | Database — schema, migrations, seed data |
| 3 | Authentication & authorization |
| 4 | Project management |
| 5 | GitHub integration |
| 6 | Developer analytics |
| 7 | Real-time collaboration |
| 8 | AI foundation — AI service, provider abstraction, RAG |
| 9 | AI features — analyzer, code review, docs, assistant |
| 10 | DevOps — Docker, CI/CD, monitoring |
| 11 | Quality — testing, security, accessibility, performance |
| 12 | Production release |

See [ROADMAP.md](./ROADMAP.md) for details.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — product and technical architecture
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [SECURITY.md](./SECURITY.md) — security policy and design
- [CHANGELOG.md](./CHANGELOG.md) — release history
- [docs/architecture](./docs/architecture/) — detailed architecture documents
- [docs/decisions](./docs/decisions/) — architecture decision records (ADRs)
- [docs/roadmap](./docs/roadmap/) — issue roadmap

## Getting started

> Not yet runnable. The commands below will become active in **Phase 1**.

```bash
# Clone the repository
git clone https://github.com/your-org/devforge.git
cd devforge

# Install dependencies
npm install

# Run validation checks
npm run validate

# Start the API and web application (Phase 1+)
npm run dev
```

## License

[MIT](./LICENSE)
