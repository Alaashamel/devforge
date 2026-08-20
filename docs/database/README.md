# Database Documentation

PostgreSQL (with pgvector extension) is the system of record for all
persistent data.

---

## Quick Reference

```bash
npm run db:migrate          # Apply pending migrations
npm run db:down             # Roll back the last migration
npm run db:status           # Show applied/pending migrations
npm run db:migrate:create   # Create a new migration file
npm run db:seed             # Seed demo data for local development
```

**Connection:** set `DATABASE_URL` in `.env` (default:
`postgres://devforge:devforge@localhost:5433/devforge`)

Dev Postgres binds host port `5433` to avoid conflicts with local
Postgres on `5432`.

---

## Schema Overview

29 tables across 7 domains, implemented via 12 versioned migrations.

### Domain Map

| Domain | Tables | Migration |
|--------|--------|-----------|
| **Identity** | `users`, `refresh_tokens`, `verification_tokens`, `password_reset_tokens` | 0001–0002 |
| **Organizations** | `organizations`, `organization_members`, `teams`, `team_members` | 0003 |
| **Projects** | `projects`, `project_members`, `milestones`, `tasks`, `labels`, `task_labels`, `task_comments`, `task_activity`, `task_dependencies` | 0004–0006 |
| **GitHub** | `github_connections`, `repositories`, `repository_webhooks`, `pull_requests`, `code_reviews` | 0007–0008 |
| **Collaboration** | `notifications`, `activities`, `chat_messages` | 0007, 0009 |
| **Analytics** | `developer_metrics` | 0007 |
| **AI** | `ai_analyses`, `ai_conversations`, `ai_messages`, `ai_jobs`, `ai_document_chunks` | 0010–0012 |

### Key Conventions

- **Primary keys:** `uuid` (default `gen_random_uuid()`)
- **Timestamps:** `created_at`, `updated_at` on every table;
  `deleted_at` for soft-deletable entities
- **Foreign keys:** `ON DELETE` chosen per relationship (restrict /
  cascade / set null)
- **Text columns:** `text` with `CHECK` length constraints; enums as
  constrained text
- **Soft delete** for user-facing content (orgs, projects, tasks)
- **Indexes** on every FK and hot query paths

---

## Entity Relationship Diagram

See [data model](../architecture/data-model.md) for full column
definitions. See [architecture diagrams](../architecture/diagrams.md)
for a Mermaid ERD.

### Identity Chain

```
users
  ├─< refresh_tokens          (SHA-256 hashed, rotation chain)
  ├─< verification_tokens     (single-use, 24h TTL)
  ├─< password_reset_tokens   (single-use, 1h TTL)
  └─< github_connections      (AES-256-GCM encrypted tokens)
```

### Organization → Project Chain

```
organizations
  ├─< organization_members    (role-based, 5 roles)
  ├─< teams >─ team_members
  └─< projects
       ├─< project_members
       ├─< milestones         (planned/active/completed/cancelled)
       ├─< tasks
       │    ├─< task_labels
       │    ├─< task_comments
       │    ├─< task_activity (append-only audit)
       │    └─< task_dependencies (cycle-checked)
       └─< labels
```

### GitHub Chain

```
repositories
  ├─< repository_webhooks    (HMAC-signed secrets)
  ├─< pull_requests          (synced from GitHub)
  └─< code_reviews           (AI-generated)
```

### AI Chain

```
ai_analyses                  (per-repository, typed reports)
ai_conversations >─< ai_messages  (assistant Q&A)
ai_jobs                      (async job tracking)
ai_document_chunks           (pgvector embeddings, HNSW indexed)
```

---

## Migrations

All migrations live in `packages/database/migrations/` and export
`up(db)` / `down(db)` functions applied inside a single transaction.

| # | Name | Purpose |
|---|------|---------|
| 0001 | identity_baseline | Users, refresh tokens, verification tokens, password reset tokens |
| 0002 | auth_indexes | Performance indexes for auth lookups |
| 0003 | organizations | Organizations, members, teams, team members |
| 0004 | projects | Projects, project members, milestones, tasks, labels |
| 0005 | task_details | Task comments, activity, dependencies, task label junction |
| 0006 | github | GitHub connections, repositories, webhooks, pull requests, code reviews |
| 0007 | analytics | Notifications, activities, developer_metrics |
| 0008 | github_unique | Unique index on `github_connections(user_id)` for upsert |
| 0009 | chat | `chat_messages` table with cursor-pagination support |
| 0010 | ai_vectors | pgvector extension, `ai_document_chunks` with HNSW index |
| 0011 | ai_analyzer | Extended `ai_analyses.type` CHECK to include `analyzer` |
| 0012 | ai_assistant | `ai_conversations.repository_id`, cascade delete, index |

### Creating a New Migration

```bash
npm run db:migrate:create -- add_feature_x
```

This creates `NNNN_add_feature_x.js` with `up`/`down` stubs.

### Migration Best Practices

1. **Expand → Migrate → Contract** for zero-downtime deployments
2. Every migration must have an idempotent rollback
3. Document any data transformation needed for backfills
4. Add indexes CONCURRENTLY in production (not inside transactions)

---

## Seed Data

`npm run db:seed` creates an idempotent demo dataset:

### Users

| Email | Role | Org |
|-------|------|-----|
| `alaa@devforge.test` | Owner | DevForge Inc. |
| `jordan@devforge.test` | Admin | Acme Labs |
| `sam@devforge.test` | Developer | DevForge Inc. |

Password for all: `DevForgeDev123!`

### Organizations & Projects

- **DevForge Inc.** — `DF` project (kanban board with tasks, milestones,
  labels, GitHub repos)
- **Acme Labs** — `AL` project

### Historical Data

Enriched seed includes: 8 historical pull requests, 6 done tasks with
estimates, completed code reviews, GitHub logins — dashboards are
meaningful on a fresh database.

---

## Redis Keys (Non-Persistent)

| Purpose | Key Pattern | TTL |
|---------|-------------|-----|
| Rate limiting | `rl:{scope}:{id}:{route}` | Sliding window |
| Session cache | `session:{userId}` | 24h |
| Presence | `presence:{orgId}:{userId}` | 60s (heartbeat) |
| Socket pub/sub | `socket.io:*` | — |
| Repo metadata cache | `gh:repo:{repoId}` | 5m |

---

## Performance Indexes

Every foreign key has an index. Additional hot-path indexes:

| Table | Index | Purpose |
|-------|-------|---------|
| `tasks` | `(project_id, status)` | Kanban board queries |
| `tasks` | `(project_id, created_at)` | Chronological listing |
| `notifications` | `(user_id, read_at)` | Unread badge |
| `developer_metrics` | `(organization_id, period)` | Analytics queries |
| `ai_document_chunks` | HNSW `vector_cosine_ops` | Vector similarity search |
| `pull_requests` | `(repository_id, state)` | PR listing |

---

## pgvector Extension

Enabled via migration 0010. Used for AI embeddings:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_document_chunks (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  embedding vector(1536),
  chunk_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON ai_document_chunks
  USING hnsw (embedding vector_cosine_ops);
```

Hybrid retrieval: combines pgvector cosine similarity with PostgreSQL
full-text search for RAG context assembly.

---

*See also: [data model](../architecture/data-model.md) ·
[architecture diagrams](../architecture/diagrams.md)*
