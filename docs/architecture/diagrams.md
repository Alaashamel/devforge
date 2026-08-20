# Architecture Diagrams

Visual diagrams for the DevForge system. All diagrams use
[Mermaid](https://mermaid.js.org/) syntax and render in GitHub's
markdown viewer.

---

## 1. System Architecture

High-level view of how the five services connect.

```mermaid
graph TB
    Browser["Browser (React SPA)"]

    subgraph "Docker Compose Stack"
        Nginx["nginx :8080"]
        Web["web :80 (internal)"]
        API["api :4000"]
        AI["ai :5001"]
        PG[("postgres :5432\npgvector")]
    end

    Browser -->|"HTTP / HTTPS"| Nginx
    Nginx -->|"/ → static files"| Web
    Nginx -->|"/api/v1/*"| API
    Nginx -->|"/socket.io/*"| API
    Nginx -->|"/metrics"| API

    API -->|"SQL + pgvector"| PG
    AI -->|"SQL + pgvector"| PG

    API -->|"POST /jobs/{id}\n(signed job intent)"| AI
    AI -->|"GET /api/v1/ai/archive/:repoId\n(signed archive pull)"| API

    subgraph "External"
        GitHub["GitHub API\nOAuth + Webhooks"]
        LLM["AI Providers\nOpenAI / Anthropic / Local"]
    end

    API -->|"OAuth + REST\n(encrypted tokens)"| GitHub
    GitHub -->|"Webhook push/PR"| API
    AI -->|"Embeddings + Completion"| LLM
```

**Key invariant:** The browser never talks to the AI service directly.
All AI requests flow through the API, which signs job intents and holds
credentials server-side.

---

## 2. Request Lifecycle

How a typical API request is processed.

```mermaid
sequenceDiagram
    participant C as Browser
    participant N as nginx
    participant A as API
    participant DB as PostgreSQL
    participant R as Redis

    C->>N: GET /api/v1/orgs/:id/projects
    N->>A: Proxy (path rewrite)
    A->>A: requestId middleware
    A->>A: requestLogger middleware
    A->>A: metrics middleware (histogram)
    A->>A: CORS check
    A->>A: JWT verify (jose)
    A->>DB: SELECT projects WHERE org_id = ?
    DB-->>A: rows
    A->>A: RBAC authorize(project.view)
    A-->>C: 200 { data: [...], meta: { total, page } }
```

---

## 3. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as API
    participant DB as PostgreSQL

    Note over U,DB: Registration
    U->>API: POST /auth/register {email, password, name}
    API->>API: Argon2id hash password
    API->>DB: INSERT user + verification_token
    API-->>U: 201 { user, verificationToken (dev only) }

    Note over U,DB: Login
    U->>API: POST /auth/login {email, password}
    API->>DB: SELECT user by email
    API->>API: Argon2id verify
    API->>DB: INSERT refresh_token (SHA-256 hash)
    API-->>U: 200 { accessToken, refreshToken }

    Note over U,DB: Authenticated request
    U->>API: GET /organizations (Bearer <accessToken>)
    API->>API: jose.jwtVerify (HS256, 15m TTL)
    API->>API: requireAuth + authorize(permission)
    API-->>U: 200 { data: [...] }

    Note over U,DB: Token refresh
    U->>API: POST /auth/refresh {refreshToken}
    API->>DB: SELECT token_hash (SHA-256 lookup)
    API->>API: Rotation: revoke old, issue new pair
    API->>DB: UPDATE revoked_at + INSERT new token
    API-->>U: 200 { accessToken, refreshToken }
```

**Refresh token rotation:** Replaying a rotated or revoked token
revokes the entire token family (reuse detection).

---

## 4. RBAC Permission Matrix

```mermaid
graph LR
    subgraph "Roles (most → least permissive)"
        Owner["Owner"]
        Admin["Admin"]
        Maintainer["Maintainer"]
        Developer["Developer"]
        Viewer["Viewer"]
    end

    subgraph "Permissions"
        P1["org.manage"]
        P2["members.manage"]
        P3["projects.create"]
        P4["projects.manage"]
        P5["projects.delete"]
        P6["repos.manage"]
        P7["tasks.manage"]
        P8["ai.run"]
        P9["project.view"]
    end

    Owner --> P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9
    Admin --> P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9
    Maintainer --> P3 & P4 & P5 & P6 & P7 & P8 & P9
    Developer --> P7 & P8 & P9
    Viewer --> P9
```

RBAC is composed: org role + project role → the more permissive wins.

---

## 5. AI Pipeline Flow

```mermaid
graph TD
    A["User clicks 'Run Analysis'"] --> B["API creates ai_jobs row\nstatus: queued"]
    B --> C["API signs job intent\nHMAC-SHA256 token"]
    C --> D["POST /jobs/{jobId}\nto AI service"]
    D --> E["AI verifies token"]
    E --> F{"Job type?"}

    F -->|"analyzer"| G1["Ingest repo archive\n(chunks, redact secrets)"]
    F -->|"code_review"| G2["Receive PR diff inline\n(no archive needed)"]
    F -->|"docs / readme"| G3["Ingest repo archive"]
    F -->|"assistant"| G4["Hybrid retrieval\n(vector + keyword)"]

    G1 --> H1["Build prompt\n(instruction layer v1)"]
    G2 --> H2["Build prompt\n(classify findings)"]
    G3 --> H3["Build prompt\n(generate markdown)"]
    G4 --> H4["Build prompt\n(context from chunks)"]

    H1 --> I["Provider gateway\nOpenAI / Anthropic / Local"]
    H2 --> I
    H3 --> I
    H4 --> I

    I --> J["Model response\n(JSON)"]
    J --> K["Pydantic validation\n(structured output check)"]
    K --> L["Application logic\n(scoring, aggregation)"]
    L --> M["Persist to ai_analyses\nor stream SSE"]

    M --> N["API reads result\nvia ai_jobs polling"]
    N --> O["Web renders analysis\nscores, findings, drafts"]
```

---

## 6. Real-Time Architecture (Socket.io)

```mermaid
graph TB
    Browser["Browser"]

    subgraph "API Server"
        Auth["JWT Handshake\n(verify accessToken)"]
        Hub["Socket.io Hub\n(single namespace)"]
        Rooms["Room Manager\n(server-authorized)"]
        Presence["Presence Tracker\n(90s TTL sweep)"]
    end

    subgraph "Rooms"
        R1["user:{userId}"]
        R2["org:{orgId}"]
        R3["project:{projectId}"]
        R4["task:{taskId}"]
        R5["chat:{orgId}"]
    end

    Browser -->|"connect\n{ accessToken }"| Auth
    Auth --> Hub
    Hub --> Rooms
    Hub --> Presence

    Hub -->|"notification:new"| R1
    Hub -->|"activity:new\npresence:update"| R2
    Hub -->|"task:created\ntask:updated\ntask:comment"| R3 & R4
    Hub -->|"chat:message\nchat:typing"| R5

    subgraph "Events (Client → Server)"
        E1["room:join\nroom:leave"]
        E2["presence:join\npresence:heartbeat"]
        E3["chat:typing"]
    end

    E1 --> Rooms
    E2 --> Presence
    E3 --> Hub
```

**Rooms are server-authorized:** the hub verifies org/project membership
in the database before allowing a join. Client-side events are never
trusted for authorization.

---

## 7. Data Model (ERD)

Simplified entity-relationship diagram. See
[data-model.md](./data-model.md) for full column definitions.

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "has"
    users ||--o{ verification_tokens : "has"
    users ||--o{ password_reset_tokens : "has"
    users ||--o{ github_connections : "links"
    users ||--o{ organization_members : "belongs to"
    users ||--o{ project_members : "assigned to"
    users ||--o{ developer_metrics : "tracked in"

    organizations ||--o{ organization_members : "has"
    organizations ||--o{ teams : "has"
    organizations ||--o{ projects : "contains"
    organizations ||--o{ repositories : "owns"
    organizations ||--o{ activities : "emits"
    organizations ||--o{ ai_analyses : "analyzed"

    teams ||--o{ team_members : "has"
    team_members }o--|| users : "member"

    projects ||--o{ project_members : "has"
    projects ||--o{ milestones : "has"
    projects ||--o{ tasks : "has"
    projects ||--o{ labels : "has"

    milestones ||--o{ tasks : "groups"

    tasks ||--o{ task_labels : "tagged with"
    tasks ||--o{ task_comments : "discussed in"
    tasks ||--o{ task_activity : "audited"
    tasks ||--o{ task_dependencies : "depends on"
    tasks }o--|| users : "assigned to"
    tasks }o--|| users : "reported by"

    labels ||--o{ task_labels : "applied to"

    repositories ||--o{ repository_webhooks : "listens to"
    repositories ||--o{ pull_requests : "has"
    repositories ||--o{ code_reviews : "reviewed"
    repositories ||--o{ ai_analyses : "analyzed"

    pull_requests ||--o{ code_reviews : "reviewed in"

    users ||--o{ notifications : "receives"
    users ||--o{ ai_conversations : "initiates"

    ai_conversations ||--o{ ai_messages : "contains"
```

---

## 8. Deployment Topology

```mermaid
graph TB
    subgraph "Production"
        LB["Load Balancer\n(TLS termination)"]
        
        subgraph "Docker Compose"
            Nginx["nginx\n:8080"]
            Web["web\nReact SPA + nginx"]
            API1["api instance 1\n:4000"]
            API2["api instance 2\n:4000\n(scaled)"]
            AI1["ai instance 1\n:5001"]
            AI2["ai instance 2\n:5001\n(scaled)"]
            PG[("PostgreSQL\npgvector")]
            Redis[("Redis\nadapter")]
        end

        LB --> Nginx
        Nginx --> Web
        Nginx --> API1
        Nginx --> API2
        API1 --> PG
        API2 --> PG
        AI1 --> PG
        AI2 --> PG
        API1 --> Redis
        API2 --> Redis
    end

    subgraph "External"
        GitHub["GitHub\nOAuth + Webhooks"]
        OpenAI["OpenAI / Anthropic"]
        Monitoring["Prometheus\n+ Grafana"]
    end

    API1 --> GitHub
    AI1 --> OpenAI
    API1 -->|"GET /metrics"| Monitoring
```

**Scaling notes:**
- API and AI services are stateless (JWT-based sessions).
- For multi-instance, swap in the Socket.io Redis adapter by setting
  `REDIS_URL`.
- PostgreSQL can be replaced with a managed service (RDS, Supabase).

---

*See also: [system-overview.md](./system-overview.md) ·
[backend-architecture.md](./backend-architecture.md) ·
[frontend-architecture.md](./frontend-architecture.md)*
