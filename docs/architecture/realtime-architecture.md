# Real-Time Architecture

Real-time features in DevForge (notifications, presence, chat, live task
updates, activity feed) are built on **Socket.io**. The hub is an in-process
module mounted on the API's HTTP server; a **Redis adapter** is the
documented upgrade path for horizontal scaling (Phase 10).

See [ADR-004](./decisions/ADR-004-realtime-architecture.md) for the decision
record.

## 1. Topology

```
Browser (Socket.io client, path /socket.io)
   │  namespace /realtime, JWT in handshake
   ▼
API instance (createRealtimeHub) ──► in-memory presence + typing state
```

Current implementation runs a single API instance: rooms, presence and typing
throttles live in-process (`apps/api/src/modules/realtime/index.js`). When the
API is horizontally scaled the hub swaps its in-memory state for the Redis
adapter:

```
API instance 1 ──┐
API instance 2 ──┼── Redis pub/sub (Redis adapter)
API instance N ──┘
```

No sticky sessions required once the adapter lands.

## 2. Namespaces and rooms

- Single namespace `/realtime`, default socket.io path, no client bundle
  served (`serveClient: false`).
- **Rooms** are scoped to avoid broadcasting to everyone:

| Room | Scope | Example events |
| --- | --- | --- |
| `user:{id}` | The individual user | notifications |
| `org:{id}` | Members of an org | presence, activity feed |
| `project:{id}` | Members of a project | task updates, comments, kanban moves |
| `task:{id}` | Anyone viewing a task | comment posted, field changed |
| `chat:{orgId}` | Members of the org chat | message, typing |

- Clients join `user:{id}` automatically on connect; every other room is
  joined via `room:join`, which is **authorized server-side** against the
  database (org membership, project role, task's owning project) before the
  `{ ok: true }` ack is returned. Room membership from the client is never
  trusted.

## 3. Event design principles

1. **Server-authoritative.** Clients emit *intents* (e.g. `task:move`) only
   in interactive editing; every state change is broadcast by the server
   after it persists to PostgreSQL.
2. **Bounded traffic.** High-frequency signals (typing, presence) are
   throttled/deduped. Full state is never sent on every event; clients
   refetch or patch.
3. **Reconnect strategy.** On reconnection the client re-joins rooms and
   refetches the affected TanStack Query keys — sockets deliver deltas, not
   sources of truth.
4. **Idempotent delivery.** Events carry `eventId`; consumers dedupe.
5. **Privacy.** Events only ever target rooms the recipient is authorized to
   be in. Chat and activity never include token material.

## 4. Event catalogue

| Event | Direction | Payload (summary) |
| --- | --- | --- |
| `presence:update` | server → org | `{ userId, status }` |
| `presence:join` / `presence:heartbeat` | client → server | `{ orgId, status? }` / `{ orgId }` |
| `chat:typing` | client → org · server → org | `{ userId, orgId }` (throttled 2s) |
| `notification:new` | server → user | `{ id, type, title, href }` |
| `task:created` | server → project | `{ task }` |
| `task:updated` | server → project | `{ taskId, changes }` |
| `task:comment` | server → task | `{ comment }` |
| `chat:message` | server → org | `{ message }` |
| `activity:new` | server → org | `{ activity }` |
| `ai:job_update` | server → project | `{ jobId, status }` (Phase 8+) |

## 5. Presence

- Clients emit `presence:join` with an org id (joins the `org:` room and
  broadcasts online) and `presence:heartbeat` every 30s.
- Presence is tracked **in memory**: `orgId → userId → { status, lastSeen,
  sockets }`. A user is marked offline when their last socket disconnects or
  a 90s TTL sweep expires; each change broadcasts `presence:update`.
- Shown in the chat sidebar and available for project views and assignment
  dropdowns.

## 6. Notifications

- Notifications are **persisted** in PostgreSQL (source of truth) and
  **pushed** over the socket as a delta.
- Unread counts are derived server-side; badges update on push, refetch on
  reconnect.

## 7. Chat

- Messages persist to PostgreSQL (`chat_messages`, migration `0009_chat`); the
  socket broadcast is a cache-friendly delta.
- History is paginated with a `created_at` cursor via the REST
  `…/chat/messages` endpoint.
- Typing indicators throttled to one broadcast per user per 2s per org.
- Markdown rendering done client-side; links sanitized.

## 8. Monitoring

- Connection counts, events/second, and queue depth exported as metrics.
- Slow or oversized events are logged for tuning.

---

*Next: [ai-service-architecture](./ai-service-architecture.md) · [api design](./api-design.md)*
