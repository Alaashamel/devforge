# ADR-001: Database Choice

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [ADR-003](./ADR-003-ai-service-boundary.md)

## Context

DevForge needs a primary relational store for identity, organizations, work
items, GitHub metadata, analytics and AI results. It also needs fast
supporting workloads: caching, rate limiting, queues and real-time pub/sub.
PostgreSQL, Redis and MongoDB were evaluated.

## Decision

- **PostgreSQL** is the primary database (system of record).
- **Redis** is used for caching, rate limiting, queues (BullMQ), presence and
  Socket.io pub/sub.
- **MongoDB is deferred.** It will only be introduced with a concrete
  architectural justification (e.g. document-shaped workload with measurable
  schema-flexibility benefit).

## Consequences

- Relational integrity, migrations and advanced querying (JSONB, full-text,
  and potential pgvector) are available in one engine.
- Redis keeps ephemeral and high-throughput concerns out of the source of
  truth.
- MongoDB will not appear in the stack unless a real need emerges; the default
  bias is against adding databases.

## Alternatives considered

- **MongoDB as primary:** rejected — the domain is heavily relational
  (orgs → projects → tasks, memberships, activity audit).
- **MySQL:** rejected — PostgreSQL's feature set (JSONB, enum, pgvector
  path, robust extensions) fits the roadmap better.
