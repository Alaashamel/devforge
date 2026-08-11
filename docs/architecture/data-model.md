# Data Model — Entity Relationship Diagram (proposal)

PostgreSQL is the system of record. This document is the authoritative
proposal for the relational schema; migrations land in Phase 2.

## 1. Conventions

- **Primary keys:** `uuid` (default `gen_random_uuid()`).
- **Timestamps:** `created_at`, `updated_at` on every table;
  `deleted_at` for soft-deletable entities.
- **Foreign keys:** `ON DELETE` semantics chosen per relationship
  (restrict/cascade/set null).
- **Text columns:** `text` with explicit `CHECK` length constraints where
  meaningful; enums as PostgreSQL `enum` types or constrained text.
- **Soft delete** for user-facing content (orgs, projects, tasks) so activity
  history survives; hard delete only for derived caches.
- Indexes are added on every foreign key and on hot query paths
  (`(organization_id, created_at)`, `(project_id, status)` etc.).

## 2. ERD (text form)

```
users
  ├─< refresh_tokens
  ├─< verification_tokens
  ├─< password_reset_tokens
  ├─< github_connections
  ├─< organization_members >─ organizations
  │                            ├─< teams >─ team_members >─ users
  │                            └─< projects
  │                                 ├─< project_members >─ users
  │                                 ├─< milestones
  │                                 ├─< tasks
  │                                 │    ├─< task_labels >─ labels
  │                                 │    ├─< task_comments
  │                                 │    ├─< task_activity
  │                                 │    └─< task_dependencies
  │                                 └─< notifications (per user/org)
  ├─< repositories >─< repository_webhooks
  │                   ├─< pull_requests
  │                   └─< code_reviews
  ├─< activities
  ├─< developer_metrics
  └─< ai_conversations >─< ai_messages
```

## 3. Tables

### 3.1 Identity

**users**
| column | type | notes |
| --- | --- | --- |
| id | uuid PK | |
| email | citext UNIQUE NOT NULL | lowercased |
| password_hash | text NOT NULL | Argon2 |
| name | text NOT NULL | |
| avatar_url | text | |
| email_verified_at | timestamptz | |
| status | enum(user/enum) | `active`, `disabled`, `pending_verification` |
| last_login_at | timestamptz | |
| created_at / updated_at | timestamptz | |

**refresh_tokens**
| column | type | notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK → users | |
| token_hash | text UNIQUE NOT NULL | SHA-256 of token; never store raw |
| expires_at | timestamptz NOT NULL | |
| revoked_at | timestamptz | set on rotation/revoke |
| replaced_by | uuid FK → refresh_tokens | rotation chain |
| user_agent / ip_address | text | audit |

**verification_tokens**, **password_reset_tokens** — token hash, user_id,
expires_at, consumed_at. Single-use; expire in 24h / 1h.

### 3.2 Organizations

**organizations**
| column | notes |
| --- | --- |
| id, name, slug (unique), avatar_url | |
| owner_id FK → users | the Owner role |
| plan | `free` (default) |
| created_at / updated_at | |

**organization_members** — `(organization_id, user_id)` PK; role
(owner/admin/maintainer/developer/viewer); status (`invited`/`active`);
invited_by; joined_at.

**teams** — id, organization_id, name, description.

**team_members** — `(team_id, user_id)` PK.

### 3.3 Projects & work items

**projects**
| column | notes |
| --- | --- |
| id, organization_id FK | |
| name, key (unique per org, e.g. `DF`) | |
| description, status (`active`/`archived`) | |
| default_priority | `low`/`medium`/`high`/`urgent` |
| created_by FK → users | |

**project_members** — `(project_id, user_id)` PK; role.

**milestones** — id, project_id, title, description, start_date, due_date,
status (`planned`/`active`/`completed`/`cancelled`), position.

**tasks** (unified task/issue/bug)
| column | notes |
| --- | --- |
| id, project_id FK, milestone_id FK (nullable) | |
| parent_id FK → tasks | for sub-tasks |
| type | `task`/`issue`/`bug` |
| status | configurable board status |
| priority | low/medium/high/urgent |
| title, description | |
| assignee_id FK → users (nullable) | |
| reporter_id FK → users | |
| due_date, estimate (number) | |
| position (float) | for kanban ordering |
| created_at / updated_at / deleted_at | |

**labels** — id, project_id, name, color.

**task_labels** — `(task_id, label_id)` PK.

**task_comments** — id, task_id, author_id, body, created_at, deleted_at.

**task_activity** — id, task_id, actor_id, action, field, old_value,
new_value, created_at. Append-only audit of changes.

**task_dependencies** — `(task_id, depends_on_id)` PK; cycle-checked in
service layer.

### 3.4 GitHub integration

**github_connections**
| column | notes |
| --- | --- |
| id, user_id FK | |
| github_user_id, github_login | |
| access_token_encrypted, refresh_token_encrypted | AES-GCM, key from env |
| token_expires_at, scopes | |
| created_at / updated_at | |

**repositories**
| column | notes |
| --- | --- |
| id, organization_id FK | |
| github_repo_id (unique with org) | |
| name, full_name, description | |
| owner_type (`user`/`org`), default_branch | |
| primary_language, url | |
| is_private | |
| stars, size_kb, pushed_at (snapshot metadata) | |
| last_synced_at | |

**repository_webhooks** — id, repository_id, github_webhook_id,
secret_encrypted, events, active, created_at.

**pull_requests** — id, repository_id, number, title, state, author,
head_ref, base_ref, additions/deletions, merged_at, created_at, metadata.

**code_reviews** — id, repository_id, pull_request_id, status
(`queued`/`running`/`completed`/`failed`), summary, findings JSONB,
severity distribution, model, created_at.

### 3.5 Collaboration

**notifications** — id, user_id, type, title, body, href, read_at,
created_at. Indexed on `(user_id, read_at)`.

**activities** — id, organization_id, actor_id, type, subject_type,
subject_id, metadata JSONB, created_at. Append-only feed.

### 3.6 Analytics

**developer_metrics** — id, user_id, organization_id, period (month), 
commits, pull_requests, reviews, issues_closed, tasks_completed,
velocity_points, health_score, computed_at. Upserted by cron job.

### 3.7 AI

**ai_analyses** — id, organization_id, repository_id, type
(`architecture`/`code_review`/`docs`/`readme`), status, model, score JSONB,
report JSONB, created_at.

**ai_conversations** — id, organization_id, user_id, project_id (nullable),
title, created_at.

**ai_messages** — id, conversation_id, role (`user`/`assistant`), content,
sources JSONB (retrieved chunks), created_at.

**ai_jobs** — id, org/project/repo refs, type, status
(`queued`/`running`/`succeeded`/`failed`), payload JSONB, result JSONB,
error, attempts, created_at, updated_at.

## 4. Key relationships summary

- A user belongs to many organizations (through membership) and many projects.
- An organization has many projects; a project has many tasks/issues.
- Tasks unify issue/bug/task types — one board per project with configurable
  statuses.
- Repositories are organization-scoped; multiple users may hold GitHub
  connections but sync goes through the org.
- All AI outputs are persisted and auditable (never only transient).

## 5. Redis keys (non-persistent)

| Purpose | Key pattern | TTL |
| --- | --- | --- |
| Rate limiting | `rl:{scope}:{id}:{route}` | window |
| Session cache | `session:{userId}` | 24h |
| Presence | `presence:{orgId}:{userId}` | 60s (heartbeat) |
| Job queue | BullMQ `df:*` | — |
| Socket pub/sub | Socket.io `socket.io:*` | — |
| Repo metadata cache | `gh:repo:{repoId}` | 5m |

## 6. Migration strategy

- Migrations versioned and applied with the `packages/database` tooling.
- Breaking changes applied in two steps (expand → migrate → contract) for
  zero-downtime where feasible.
- Every migration ships with an idempotent rollback and documented data
  transformation when backfilling is required.

---

*Next: [api design](./api-design.md) · [database docs](../database/)*
