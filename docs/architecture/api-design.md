# API Design

The DevForge REST API lives under `/api/v1`, is JSON-only, and follows a
small set of stable conventions so the frontend and integrations can rely on
it. Socket.io handles real-time traffic on `/realtime`.

## 1. Resource conventions

- **Nouns, plural:** `GET /api/v1/organizations/:orgId/projects`.
- **Nested scoping** reflects ownership: `/:orgId` → `/:projectId` → resources.
- **Actions** that are not CRUD use a verb suffix:
  `POST /auth/refresh`, `POST /repositories/:repoId/sync`,
  `POST /ai/analyses`.
- **Versioning** in the path; breaking changes bump `/v2`.

## 2. Responses

Success envelope (list):

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 132,
    "totalPages": 6
  }
}
```

Success envelope (single): `{ "data": { ... } }`.

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title", "message": "Title is required" }
    ],
    "requestId": "a1b2c3"
  }
}
```

`code` values are stable machine-readable identifiers (`VALIDATION_ERROR`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`GITHUB_ERROR`, `AI_JOB_FAILED`, ...). The `errorHandler` maps domain errors
to these envelopes automatically.

## 3. Pagination, filtering, sorting, search

- **Pagination:** `?page=1&pageSize=25` (pageSize capped at 100). Cursor
  pagination used for append-only feeds (activity, notifications).
- **Filtering:** `?status=open&assigneeId=<uuid>&priority=high` — one value
  per param; array params via repeat (`?label=a&label=b`).
- **Sorting:** `?sort=-created_at` (prefix `-` for descending).
- **Search:** `?q=` performs a weighted ILIKE across searchable fields.
- All list responses include `meta` with totals.

## 4. Authentication

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/auth/register` | create account (verification email) |
| `POST /api/v1/auth/login` | returns `{ accessToken, refreshToken }` |
| `POST /api/v1/auth/refresh` | rotate refresh token (reuse detection) |
| `POST /api/v1/auth/logout` | revoke refresh token |
| `POST /api/v1/auth/verify-email` | confirm email |
| `POST /api/v1/auth/forgot-password` | send reset link |
| `POST /api/v1/auth/reset-password` | set new password |

Access tokens: short-lived JWTs (15 min) in memory on the client; refresh
tokens (7 days) rotating, stored hashed server-side. Protected endpoints
require `Authorization: Bearer <accessToken>`. See ADR-002.

## 5. RBAC

The permission matrix is enforced by middleware:

| Action | Owner | Admin | Maintainer | Developer | Viewer |
| --- | --- | --- | --- | --- | --- |
| Manage org settings | ✔ | ✔ | | | |
| Manage members/teams | ✔ | ✔ | | | |
| Create/delete projects | ✔ | ✔ | ✔ | | |
| Manage tasks/issues | ✔ | ✔ | ✔ | ✔ | |
| View project content | ✔ | ✔ | ✔ | ✔ | ✔ |
| Run AI analysis | ✔ | ✔ | ✔ | ✔ | |
| Import/manage repos | ✔ | ✔ | ✔ | | |

Org roles (from membership) and project roles (project_members) compose: the
**more permissive** wins, Owner is always supreme. Every protected route
declares the required permission; unauthorized access returns `403 FORBIDDEN`.

## 5b. Project management resources

Phase 4 routes follow the `/:orgId → /:projectId → resource` nesting:

```
GET/POST        /api/v1/organizations/:orgId/projects
GET/PATCH/DELETE /api/v1/organizations/:orgId/projects/:projectId
PUT/DELETE      /api/v1/organizations/:orgId/projects/:projectId/members/:userId
GET/POST        /api/v1/organizations/:orgId/projects/:projectId/milestones
GET/PATCH/DELETE /api/v1/organizations/:orgId/projects/:projectId/milestones/:milestoneId
GET/POST        /api/v1/organizations/:orgId/projects/:projectId/labels
GET/PATCH/DELETE /api/v1/organizations/:orgId/projects/:projectId/labels/:labelId
GET/POST        /api/v1/organizations/:orgId/projects/:projectId/tasks
GET/PATCH/DELETE /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId
GET/POST        /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/comments
PATCH/DELETE    /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/comments/:commentId
PUT             /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/labels
GET             /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/activity
GET/POST        /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/dependencies
DELETE          /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/dependencies/:dependsOnId
```

Conventions specific to this module:

- **Label replacement** (`PUT …/labels`) replaces the task's full label set;
  the response embeds `labels: [{ id, name, color }]`.
- **Audit ledger** (`GET …/activity`) records actor-scoped events — `created`,
  `status_change`, `priority_change`, `assignee_change`, `milestone_change`,
  `labels_change`, `comment`, `dependency_added`/`removed` — written in the
  same transaction as the change.
- **Dates** are `YYYY-MM-DD` strings in both requests and responses
  (pg `date` columns are converted so values are timezone-independent).
- **Aggregates** on list responses: projects return `taskCount`,
  `memberCount` and `taskCounts.byStatus`; milestones and labels return
  `taskCount`.

## 6. Validation

- Zod schemas live in each module's `schemas.js` and mirror frontend forms.
- `validate(schema)` middleware rejects `400 VALIDATION_ERROR` with per-field
  details before the controller runs.
- Unknown query params on list endpoints are ignored; unknown body keys are
  rejected to surface typos early.

## 7. Rate limiting

- Global per-IP limits and stricter per-route limits on auth and AI endpoints
  (Redis-backed sliding window).
- `429 RATE_LIMITED` with `Retry-After` header.

## 8. Idempotency & jobs

- Mutating GitHub/webhook handlers accept `Idempotency-Key`; duplicate
  deliveries are deduped.
- Long-running AI work is submitted as a job and returns
  `202 { data: { jobId } }`; the client polls
  `GET /api/v1/ai/jobs/:jobId` or subscribes to `ai:job_update` over the
  socket.

## 9. External service errors

GitHub failures map to `502 GITHUB_ERROR` with a retryable flag;
unavailability of the AI service maps to `503 AI_UNAVAILABLE`. The client
may surface these distinctly from application errors.

## 10. Headers

- `X-Request-Id` echoed on every response (also in the error envelope).
- `X-RateLimit-*` on rate-limited routes.
- CORS restricted to configured frontend origins; credentials off.
- Security headers set via Helmet-compatible defaults.

---

*Next: [realtime architecture](./realtime-architecture.md) · [backend architecture](./backend-architecture.md)*
