# DevForge API Reference

Base URL: `http://localhost:4000` (development) or `https://api.example.com` (production).

All responses use a consistent envelope:

```json
{ "data": { ... } }
```

Errors:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [...] } }
```

---

## Table of Contents

- [Authentication](#authentication)
- [Pagination & Filtering](#pagination--filtering)
- [Error Codes](#error-codes)
- [Health & Metrics](#health--metrics)
- [Auth Module](#auth-module)
- [Organizations](#organizations)
- [Projects](#projects)
- [Milestones](#milestones)
- [Labels](#labels)
- [Tasks](#tasks)
- [GitHub OAuth](#github-oauth)
- [Repositories](#repositories)
- [Analytics](#analytics)
- [Notifications](#notifications)
- [Activity Feed](#activity-feed)
- [Chat](#chat)
- [AI Module](#ai-module)
- [Real-Time (Socket.io)](#real-time-socketio)

---

## Authentication

All authenticated requests require a `Authorization: Bearer <accessToken>`
header. Access tokens are short-lived HS256 JWTs (default 15 minutes).

Obtain tokens via `POST /api/v1/auth/login` or `POST /api/v1/auth/register`.
Refresh expired tokens via `POST /api/v1/auth/refresh`.

```bash
curl -H "Authorization: Bearer eyJ..." http://localhost:4000/api/v1/organizations
```

---

## Pagination & Filtering

List endpoints support:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 20 | Items per page |
| `sort` | `created_at` | Sort field (direction via `-` prefix) |
| `q` | — | Full-text search |

Response meta:

```json
{
  "data": [...],
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request body or params failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Authenticated but lacks required permission |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource (e.g. unique constraint) |
| `RATE_LIMITED` | 429 | Too many requests (retry after `Retry-After` header) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Health & Metrics

### Liveness

```
GET /api/v1/health
GET /api/v1/health/live
```

Returns 200 with `{ status: "ok" }`.

### Readiness

```
GET /api/v1/health/ready
```

Returns 200 when the database is reachable, 503 `"degraded"` otherwise.

### Prometheus Metrics

```
GET /metrics
```

Returns Prometheus text format. No authentication required.

---

## Auth Module

`/api/v1/auth`

All auth endpoints are rate-limited per IP.

### Register

```
POST /api/v1/auth/register
```

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "name": "Jane Doe"
}
```

**Response 201:**

```json
{
  "data": {
    "user": { "id": "...", "email": "user@example.com", "name": "Jane Doe" },
    "verificationToken": "abc123..."
  }
}
```

> In production, the verification token is sent via email and never
> returned in the response.

### Login

```
POST /api/v1/auth/login
```

```json
{ "email": "user@example.com", "password": "SecureP@ss123" }
```

**Response 200:**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "opaque-rotating-token",
    "user": { "id": "...", "email": "user@example.com" }
  }
}
```

### Refresh Token

```
POST /api/v1/auth/refresh
```

```json
{ "refreshToken": "opaque-rotating-token" }
```

Returns a new `accessToken` + `refreshToken` pair. The old refresh token
is revoked (rotation with reuse detection).

### Logout

```
POST /api/v1/auth/logout
```

```json
{ "refreshToken": "..." }
```

### Verify Email

```
POST /api/v1/auth/verify-email
```

```json
{ "token": "abc123..." }
```

### Forgot Password

```
POST /api/v1/auth/forgot-password
```

```json
{ "email": "user@example.com" }
```

### Reset Password

```
POST /api/v1/auth/reset-password
```

```json
{ "token": "abc123...", "password": "NewP@ss456" }
```

### Get Current User

```
GET /api/v1/auth/me
```

**Response 200:**

```json
{
  "data": {
    "id": "...",
    "email": "user@example.com",
    "name": "Jane Doe",
    "avatarUrl": "...",
    "emailVerifiedAt": "2026-01-15T10:00:00Z",
    "status": "active"
  }
}
```

---

## Organizations

### List My Organizations

```
GET /api/v1/organizations
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "...",
      "name": "Acme Labs",
      "slug": "acme-labs",
      "role": "admin",
      "memberCount": 12,
      "projectCount": 5
    }
  ]
}
```

### List Organization Members

```
GET /api/v1/organizations/:orgId/members
```

Requires: `project.view`

---

## Projects

Base: `/api/v1/organizations/:orgId/projects`

### List Projects

```
GET …/projects
```

Requires: `project.view`

### Create Project

```
POST …/projects
```

```json
{
  "name": "DevForge",
  "key": "DF",
  "description": "AI-powered developer platform",
  "defaultPriority": "medium"
}
```

Requires: `projects.create`

### Get Project

```
GET …/projects/:projectId
```

### Update Project

```
PATCH …/projects/:projectId
```

Requires: `projects.manage`

### Delete Project

```
DELETE …/projects/:projectId
```

Requires: `projects.delete`

### Project Members

```
GET    …/projects/:projectId/members
PUT    …/projects/:projectId/members/:userId     { "role": "developer" }
DELETE …/projects/:projectId/members/:userId
```

Requires: `projects.manage` (write), `project.view` (read)

---

## Milestones

Base: `…/projects/:projectId/milestones`

```
GET    …/milestones
POST   …/milestones          { "title", "description", "dueDate", "status" }
PATCH  …/milestones/:milestoneId
DELETE …/milestones/:milestoneId
```

Requires: `project.view` (read), `projects.manage` (write)

Milestone statuses: `planned`, `active`, `completed`, `cancelled`

---

## Labels

Base: `…/projects/:projectId/labels`

```
GET    …/labels
POST   …/labels              { "name", "color": "#ff0000" }
PATCH  …/labels/:labelId
DELETE …/labels/:labelId
```

Requires: `project.view` (read), `projects.manage` (write)

Colors must be valid hex (`#rrggbb`). Duplicate names per project return
409.

---

## Tasks

Base: `…/projects/:projectId/tasks`

### CRUD

```
GET    …/tasks               ?status=open&priority=high&q=search&sort=-created_at&page=1&limit=20
POST   …/tasks               { "title", "type", "status", "priority", "assigneeId", "milestoneId", "dueDate", "estimate" }
GET    …/tasks/:taskId
PATCH  …/tasks/:taskId       { "status": "in_progress", "priority": "urgent" }
DELETE …/tasks/:taskId
```

Task types: `task`, `issue`, `bug`

Filters: `?status=`, `?priority=`, `?type=`, `?assigneeId=`, `?milestoneId=`, `?label=`

Requires: `project.view` (read), `tasks.manage` (write)

### Comments

```
GET    …/tasks/:taskId/comments
POST   …/tasks/:taskId/comments        { "body": "Looks good!" }
PATCH  …/tasks/:taskId/comments/:commentId   { "body": "Updated" }
DELETE …/tasks/:taskId/comments/:commentId
```

### Labels

```
PUT …/tasks/:taskId/labels   { "labels": [{ "id": "...", "name": "bug", "color": "#ff0000" }] }
```

### Activity

```
GET …/tasks/:taskId/activity
```

Returns append-only audit events: `created`, `status_change`,
`priority_change`, `labels_change`, `comment`, `dependency_added`, etc.

### Dependencies

```
GET    …/tasks/:taskId/dependencies
POST   …/tasks/:taskId/dependencies        { "dependsOnId": "..." }
DELETE …/tasks/:taskId/dependencies/:dependsOnId
```

Self-dependencies, cross-project dependencies, and cycles are rejected
with 409.

---

## GitHub OAuth

### Begin OAuth Flow

```
POST /api/v1/github/oauth/begin
```

**Response 200:**

```json
{ "data": { "url": "https://github.com/login/oauth/authorize?client_id=..." } }
```

### OAuth Callback

```
GET /api/v1/github/oauth/callback?code=...&state=...
```

Handled automatically by GitHub redirect. Returns 302 to the web app
with `?github=connected` or `?github=error`.

### Connection Status

```
GET /api/v1/github/connection
```

### Disconnect

```
POST /api/v1/github/disconnect
```

---

## Repositories

Base: `/api/v1/organizations/:orgId/repositories`

### Import

```
POST …/repositories/import    { "owner": "acme", "name": "web" }
```

Requires: `repos.manage`

### List / Get

```
GET …/repositories
GET …/repositories/:repoId
```

Requires: `project.view`

### Sync

```
POST …/repositories/:repoId/sync
```

Refreshes metadata and pull requests from GitHub. Requires: `repos.manage`

### Delete

```
DELETE …/repositories/:repoId
```

### Pull Requests

```
GET …/repositories/:repoId/pull-requests    ?state=open&page=1&limit=20
```

### Branches

```
GET …/repositories/:repoId/branches
```

### Commits

```
GET …/repositories/:repoId/commits    ?sha=main&limit=30
```

### Issues

```
GET …/repositories/:repoId/issues     ?state=open
```

### Webhooks

```
GET    …/repositories/:repoId/webhooks
POST   …/repositories/:repoId/webhooks         { "events": ["push", "pull_request"] }
DELETE …/repositories/:repoId/webhooks/:webhookId
```

Requires: `project.view` (read), `repos.manage` (write)

---

## Analytics

Base: `/api/v1/organizations/:orgId/analytics`

All endpoints require: `project.view`

### Overview

```
GET …/analytics/overview
```

Returns counts (projects, tasks, repos, members), additions/deletions,
completion ratio, top contributors, recently merged PRs.

### Velocity

```
GET …/analytics/velocity     ?weeks=12
```

Weekly buckets (Monday-aligned) of merged PRs, done tasks, closed
issues, and completed reviews.

### Health

```
GET …/analytics/health
```

Weighted 0–100 score with `healthy` / `degraded` / `critical` /
`no_data` status. Components: task completion, merge rate, issue close
rate, review coverage.

### Developers

```
GET …/analytics/developers   ?weeks=12
```

Per-member task + PR aggregation with velocity points and health scores.

### Repositories

```
GET …/analytics/repositories
```

Summary stats for all imported repositories.

### Repository Activity

```
GET …/analytics/repositories/:repoId/activity    ?months=6
```

Monthly, recent, and review-by-status breakdowns.

---

## Notifications

`/api/v1/notifications`

```
GET  /api/v1/notifications              ?limit=50&unread=true
GET  /api/v1/notifications/unread-count
POST /api/v1/notifications/read-all
POST /api/v1/notifications/:id/read
```

Notifications are user-scoped (derived from the access token). Types
include `task_assigned`, `task_updated`, `task_commented`,
`notification:new` (real-time push).

---

## Activity Feed

`/api/v1/organizations/:orgId/activity`

```
GET …/activity       ?limit=50
```

Append-only feed of task events across the organization. Requires:
`project.view`

---

## Chat

`/api/v1/organizations/:orgId/chat`

```
GET  …/chat/messages       ?before=<messageId>&limit=50
POST …/chat/messages       { "body": "Hello team!" }
```

Requires: `project.view`

Messages are persisted in `chat_messages` and broadcast in real-time
via Socket.io to the `chat:{orgId}` room.

---

## AI Module

Base: `/api/v1/organizations/:orgId/ai`

### Create Analysis

```
POST …/ai/analyses
```

```json
{
  "type": "analyzer",
  "repositoryId": "..."
}
```

Analysis types: `analyzer`, `code_review`, `docs`, `readme`

For `code_review`, include `pullRequestNumber`:

```json
{
  "type": "code_review",
  "repositoryId": "...",
  "pullRequestNumber": 42
}
```

Requires: `ai.run`

**Response 201:**

```json
{
  "data": {
    "jobId": "...",
    "status": "queued"
  }
}
```

### List Analyses

```
GET …/ai/analyses    ?type=analyzer&pullRequestNumber=42
```

### Get Analysis

```
GET …/ai/analyses/:analysisId
```

### Approve Analysis Result (Docs/README)

```
POST …/ai/analyses/:analysisId/approve
```

```json
{
  "filePath": "README.md",
  "repositoryId": "..."
}
```

Commits the generated file to GitHub via the Contents API. The approval
is recorded in `report.approvals`.

### Job Status

```
GET …/ai/jobs/:jobId
```

Poll until `status` is `succeeded` or `failed`.

### Conversations

```
GET    …/ai/conversations
POST   …/ai/conversations                { "title": "Architecture Q&A", "repositoryId": "..." }
GET    …/ai/conversations/:conversationId
DELETE …/ai/conversations/:conversationId
```

### Messages

```
GET …/ai/conversations/:conversationId/messages
```

### Stream Assistant Reply

```
POST …/ai/conversations/:conversationId/stream
```

```json
{
  "repositoryId": "...",
  "message": "How is the auth module structured?"
}
```

Returns Server-Sent Events:

```
event: sources
data: [{"path":"src/modules/auth/routes.js","chunk":"..."}]

event: delta
data: "The auth module uses..."

event: delta
data: " JWT tokens with..."

event: done
data: {}
```

Requires: `ai.run`

---

## Real-Time (Socket.io)

Namespace: `/realtime`

### Connection

```javascript
const socket = io('/realtime', { auth: { accessToken: 'eyJ...' } });
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ room: 'org:{id}' }` | Join a room (server-verified) |
| `room:leave` | `{ room: 'org:{id}' }` | Leave a room |
| `presence:join` | `{ orgId }` | Set online presence |
| `presence:heartbeat` | `{ orgId }` | Keep presence alive (90s TTL) |
| `chat:typing` | `{ orgId }` | Emit typing indicator (2s throttle) |

### Server → Client Events

| Event | Room | Payload |
|-------|------|---------|
| `notification:new` | `user:{id}` | `{ id, type, title, body, href }` |
| `activity:new` | `org:{id}` | `{ id, type, actor, subject }` |
| `presence:update` | `org:{id}` | `{ onlineUserIds: [...] }` |
| `task:created` | `project:{id}` | `{ task }` |
| `task:updated` | `project:{id}` / `task:{id}` | `{ task, changes }` |
| `task:comment` | `task:{id}` | `{ comment }` |
| `chat:message` | `chat:{orgId}` | `{ message }` |
| `chat:typing` | `chat:{orgId}` | `{ userId, orgId }` |

---

*See also: [architecture diagrams](../architecture/diagrams.md) ·
[api design](../architecture/api-design.md) ·
[backend architecture](../architecture/backend-architecture.md)*
