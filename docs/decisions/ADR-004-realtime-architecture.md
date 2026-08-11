# ADR-004: Real-Time Architecture

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [realtime-architecture](../architecture/realtime-architecture.md)

## Context

DevForge needs real-time collaboration: notifications, presence, typing
indicators, live task updates, chat and an activity feed. The API must scale
horizontally, so real-time traffic cannot depend on a single instance.

## Decision

- **Socket.io** with the **Redis adapter** for pub/sub across instances.
- One namespace `/realtime`, authenticated via JWT in the handshake.
- **Rooms scoped by entity** (`org:{id}`, `project:{id}`, `task:{id}`,
  `chat:{orgId}`); membership is server-verified against RBAC.
- **Server-authoritative events**: clients emit intents; state changes are
  broadcast only after persistence.
- High-frequency events (typing, presence) are throttled/deduped; reconnect
  triggers room re-join + TanStack Query refetch.

## Consequences

- Horizontal scaling of the API is straightforward; Redis is the shared
  coordination point.
- Event traffic is bounded by room scope and throttling — no cross-org leaks.
- Delivering deltas (not full state) keeps socket payloads small; the DB
  remains the source of truth.

## Alternatives considered

- **Server-Sent Events (SSE):** rejected — bidirectional needs (typing,
  presence, chat) and room fan-out favor WebSockets.
- **Native WebSocket only:** rejected — Socket.io provides rooms, reconnect
  and the Redis adapter out of the box.
