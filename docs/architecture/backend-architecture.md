# Backend Architecture (apps/api)

The API is an Express application organized into **domain modules**. Each
module is self-contained: routes, controllers, services, repositories and
schemas live together and communicate through explicit boundaries.

## 1. Module layout

```
apps/api/src/
├── app.js                 # Express app assembly, middleware wiring
├── server.js              # Process entry point (HTTP + Socket.io)
├── config/                # env validation, logging config
├── middleware/            # requestId, errorHandler, auth, rbac, validate, rateLimit
├── modules/
│   ├── auth/              # routes, controller, service, repository, schemas
│   ├── organizations/
│   ├── projects/
│   ├── github/
│   ├── analytics/
│   ├── realtime/          # Socket.io hub: rooms, presence, typing
│   ├── notifications/     # persisted inbox + live push
│   ├── activity/          # org activity feed + live broadcast
│   ├── chat/              # persisted team chat + live broadcast
│   └── ai-gateway/
├── database/              # pool, migrations, seed
├── utils/                 # jwt, crypto, pagination, http
└── events/                # event bus definitions
```

## 2. Module anatomy

Every module follows the same shape:

```
modules/<name>/
├── routes.js          # Express router, endpoint definitions
├── controller.js      # HTTP concerns: req/res, status codes, envelopes
├── service.js         # business rules, orchestration (no HTTP, no SQL)
├── repository.js      # data access (PostgreSQL queries, Redis)
├── schemas.js         # Zod input validation schemas
├── events.js          # domain events emitted on changes (optional)
└── index.js           # public exports, DI wiring
```

Layering rules:

- **Controller** must not contain business logic or raw SQL.
- **Service** must not touch `req`/`res` or emit HTTP concerns.
- **Repository** must not know about HTTP or business rules.
- Dependencies flow one way: routes → controller → service → repository.

## 3. Request lifecycle

```
Client
  → Nginx (TLS, static assets)
  → app.use(requestId)
  → app.use(logger)            # structured JSON with request id
  → app.use(cors, helmet)
  → app.use('/api/v1', routes) # auth → rbac → validate → controller
  → controller → service → repository
  → controller → response envelope
  → errorHandler (on throw)    # stable error envelope, status mapping
```

## 4. Domain event bus

Modules emit **domain events** (e.g. `task.created`, `pull_request.opened`)
on a lightweight in-process event bus. Listeners handle side effects:
notifications, activity feed, real-time broadcast, AI job dispatch. Events
are the seam that keeps modules decoupled; cross-module effects never call
another module's service directly.

## 5. Concurrency, jobs and queues

- Heavy work (GitHub sync, AI jobs) is enqueued through Redis (BullMQ) and
  executed by worker processes.
- The API responds fast to the caller; consumers converge state in the
  background.
- Idempotency keys on webhook and job handlers prevent duplicate side effects.

## 6. Config & environment

- `config/` validates `process.env` at boot with Zod; the process refuses to
  start when required variables are missing or malformed.
- Sensitive values (DB URLs, JWT secrets, OAuth secrets) come from
  environment variables only. Never from code or config files.

## 7. Error model

The API exposes a stable error envelope (see [api-design](./api-design.md)).
A centralized `errorHandler` maps typed domain errors to status codes:

| Error type | HTTP status |
| --- | --- |
| `ValidationError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 |
| `ExternalServiceError` | 502/504 |

## 8. Socket.io

The realtime namespace is mounted on the same HTTP server. Connection is
authenticated with a JWT; rooms are scoped by organization/project/task. See
[realtime-architecture](./realtime-architecture.md).

## 9. Testing

- Unit: services and repositories against mocks/fakes (Vitest).
- Integration: API routes against a real PostgreSQL in test containers
  (Supertest).
- See [testing strategy](../testing-strategy.md) when added.

---

*Next: [api design](./api-design.md) · [data model](./data-model.md) · [realtime](./realtime-architecture.md)*
