# ADR-003: AI Service Boundary

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [ai-service-architecture](../architecture/ai-service-architecture.md)

## Context

DevForge's AI capabilities (repository analysis, code review, documentation
generation, engineering assistant) involve provider calls, embeddings, vector
search and prompt engineering. These evolve quickly and have different
operational characteristics (GPU/latency/budget) than the core API.

## Decision

- The AI layer is a **separate Python/FastAPI service** (`apps/ai`).
- The **API is the only entry point** for the browser; it submits bounded
  **job intents** and receives validated, structured results.
- The AI service exposes a **provider-agnostic gateway** (adapters for
  OpenAI/Anthropic/local models) selected by configuration, with fallback.
- Repository content reaches the AI service through **sanitized, credential-free
  archives**; the AI service never holds GitHub tokens or org secrets.
- Embeddings/vector storage are owned by the AI service (pgvector in
  PostgreSQL, or a dedicated vector store when justified).

## Consequences

- Provider, model and prompt changes do not touch the core platform.
- The core API stays dependency-light and fast; AI is behind queues with
  bounded concurrency and org-level quotas.
- Clear security boundary: models never receive credentials.

## Alternatives considered

- **AI inside the Node API:** rejected — mixed operational profiles, heavy
  dependency surface, provider churn would destabilize the core API.
- **Third-party AI platform only:** rejected — lock-in and no local-model
  path.
