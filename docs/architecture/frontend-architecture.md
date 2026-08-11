# Frontend Architecture (apps/web)

The web application is a React single-page application built with Vite.
It renders server data, dispatches user intents and collaborates in real
time — it never contains business logic or credentials.

## 1. Stack

| Concern | Tool |
| --- | --- |
| Rendering | React 18 (JavaScript) |
| Build | Vite |
| Routing | React Router |
| Server state | TanStack Query |
| Client state | Zustand |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS |
| Real-time | Socket.io client |
| Charts | Recharts |
| Testing | Vitest + React Testing Library |

## 2. Source layout

```
apps/web/src/
├── main.jsx            # entry, providers, router
├── app.jsx             # root component, layout shell
├── components/         # presentational primitives (Button, Badge, Modal, ...)
├── features/           # feature modules (auth, projects, github, ai, ...)
│   └── <feature>/
│       ├── components/ # feature-specific components
│       ├── hooks/      # feature hooks
│       └── api.js      # feature API calls
├── pages/              # route-level pages (compose features)
├── layouts/            # app shell, org shell, project shell
├── hooks/              # shared hooks (useAuth, useSocket, useDebounce, ...)
├── services/           # api client, socket client
├── stores/             # zustand stores
├── utils/              # formatters, validators
└── lib/                # integrations and providers
```

## 3. State architecture

- **Server state** (projects, tasks, PRs, analytics, AI results) is fetched
  and cached by **TanStack Query**. Keys follow
  `['org', orgId, 'projects', filters]` so caching, invalidation and
  pagination are uniform.
- **Client state** (theme, sidebar, transient UI) lives in small **Zustand**
  stores. Zustand is not used for server data.
- **Forms** use React Hook Form with Zod resolver for validation mirroring
  API schemas.
- **Real-time** state (presence, typing, notifications) arrives over
  Socket.io and is written into TanStack Query caches or a dedicated store.

## 4. Routing

```
/app                  → workspace landing
/auth/login
/auth/register
/orgs/:orgId          → org dashboard
/orgs/:orgId/projects/:projectId
  /board              → kanban
  /issues
  /issues/:issueId
  /milestones
  /roadmap
  /analytics
/orgs/:orgId/repos/:repoId   → repository dashboard + AI analysis
/orgs/:orgId/settings
/orgs/:orgId/docs
```

Route guards check authentication and (client-side, advisory) RBAC. The
server remains the authoritative permission enforcement point.

## 5. API client

A thin `services/api.js` wraps `fetch` with:

- base URL from env;
- `Authorization: Bearer <token>` injection;
- automatic refresh on 401 (single-flight);
- error envelope parsing into typed errors;
- request IDs surfaced for support.

## 6. Real-time client

`services/socket.js` connects to `/realtime` after login. Events are mapped
to TanStack Query cache updates so components react to remote changes
without bespoke wiring.

## 7. Design system

Dark-first, developer-tool aesthetic. Tailwind-based tokens (colors, spacing,
type scale) defined in the `ui` package. Accessible by default: semantic
markup, keyboard navigation, focus states, reduced-motion support.

## 8. Testing

- **Unit**: utilities and hooks (Vitest + Testing Library).
- **Component**: feature components with mocked API client and socket.
- **Integration**: route-level flows with mocked server.

---

*Next: [backend architecture](./backend-architecture.md) · [api design](./api-design.md)*
