# Real-Time Architecture

Real-time features in DevForge (notifications, presence, chat, live task
updates, activity feed) are built on **Socket.io with the Redis adapter**.

See [ADR-004](./decisions/ADR-004-realtime-architecture.md) for the decision
record.

## 1. Topology

```
Browser (Socket.io client)
   │  /realtime, JWT in handshake
   ▼
API instance 1 ──┐
API instance 2 ──┼── Redis pub/sub (Redis adapter)
API instance N ──┘
```

Multiple API instances are all connected through Redis; an event emitted on
one instance reaches clients on every instance. No sticky sessions required.

## 2. Namespaces and rooms

- Single namespace `/realtime`.
- **Rooms** are scoped to avoid broadcasting to everyone:

| Room | Scope | Example events |
| --- | --- | --- |
| `org:{orgId}` | Members of an org | presence, notifications, activity feed |
| `project:{projectId}` | Members of a project | task updates, comments, kanban moves |
| `task:{taskId}` | Anyone viewing a task | comment posted, field changed |
| `chat:{orgId}` | Members of the org chat | message, typing |

- A client joins rooms only after server-side RBAC verification.
- **No client-room join privileges are trusted**; the server authorizes and
  only then emits the `room:joined` acknowledgement.

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

## 4. Event catalogue (initial)

| Event | Direction | Payload (summary) |
| --- | --- | --- |
| `presence:update` | server → room | `{ userId, status, projectId }` |
| `notification:new` | server → user | `{ id, type, title, href }` |
| `task:updated` | server → project | `{ taskId, changes }` |
| `task:comment` | server → task | `{ comment }` |
| `chat:message` | server → org | `{ message }` |
| `chat:typing` | server → org | `{ userId, threadId }` (throttled) |
| `activity:new` | server → org | `{ activity }` |
| `ai:job_update` | server → project | `{ jobId, status }` |

## 5. Presence

- Heartbeat every 25s; absent after 60s → marked offline.
- Presence is stored in Redis with a TTL, keyed by user + org.
- Shown in project views, chat and assignment dropdowns.

## 6. Notifications

- Notifications are **persisted** in PostgreSQL (source of truth) and
  **pushed** over the socket as a delta.
- Unread counts are derived server-side; badges update on push, refetch on
  reconnect.

## 7. Chat

- Messages persist to PostgreSQL; the socket broadcast is a cache-friendly
  delta.
- Typing indicators throttled to one update per user per 2s per thread.
- Markdown rendering done client-side; links sanitized.

## 8. Monitoring

- Connection counts, events/second, and queue depth exported as metrics.
- Slow or oversized events are logged for tuning.

---

*Next: [ai-service-architecture](./ai-service-architecture.md) · [api design](./api-design.md)*
