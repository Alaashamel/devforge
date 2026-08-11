# ADR-006: Frontend Stack

- **Status:** Accepted
- **Date:** 2026-08-12
- **Related:** [frontend-architecture](../architecture/frontend-architecture.md)

## Context

The web application must be maintainable, fast to iterate on, and consistent
with the rest of the stack. The stack decision fixes the language, build
tooling and state/data layers.

## Decision

- **JavaScript (not TypeScript)** with **React 18**, **Vite** build tooling.
- **React Router** for routing, **TanStack Query** for server state,
  **Zustand** for client state, **React Hook Form + Zod** for forms.
- **Tailwind CSS** for styling, **Recharts** for charts, **Socket.io client**
  for real-time.

### Why JavaScript?

The project deliberately standardizes on JavaScript:

- The target developer audience for this open-source platform spans levels;
  JavaScript keeps the barrier to contribution low.
- Domain safety is pushed to **Zod runtime validation at the API boundary**,
  which gives the same confidence for wire data without a compile step.
- The backend, shared packages and tooling are all JavaScript; consistency
  across the repo reduces cognitive overhead.

This is a deliberate product decision. **DevForge will not migrate to
TypeScript.**

## Consequences

- Faster onboarding for contributors; fewer build-step concerns.
- Data-shape errors surface at runtime; mitigated by Zod validation of all
  API inputs/outputs and thorough tests.
- The UI package and shared package enforce naming/type conventions so the
  API boundary is the single contract point.

## Alternatives considered

- **TypeScript everywhere:** rejected by product decision above (see Why
  JavaScript).
- **Next.js over Vite SPA:** rejected — this is a logged-in workspace app
  without need for SSR; Vite keeps the dev loop fast.
