# AI Service Architecture (apps/ai)

The AI service is a Python/FastAPI application that owns repository
ingestion, embeddings, vector search (RAG) and model invocation. It is
deliberately isolated from the API so that providers, models and prompt
engineering can evolve without touching the core platform.

## 1. Boundaries

```
Browser ──► API (apps/api)
                │  POST /api/v1/organizations/:orgId/ai/analyses  (bounded job intents)
                │  GET  /api/v1/organizations/:orgId/ai/jobs/:jobId  (status)
                ▼
           AI service (apps/ai)
                │  POST /jobs/{jobId}          (X-Devforge-Job-Token)
                │  GET  /api/v1/ai/archive/:repoId?token=…   (signed archive pull, repo analyses)
                ▼
           Pipelines: ingestion · analysis · analyzer · review · docs · assistant
                │  provider gateway (OpenAI / Anthropic / local …)
                ▼
           Embeddings + vector store (RAG)
```

Rules:

- The **browser never talks to the AI service directly**.
- The **API never receives raw model output**; it receives validated,
  structured job results that the AI service persists/returns through a
  typed contract.
- The AI service **never receives credentials** (GitHub tokens, org secrets).
  Archives are pulled from a signed API endpoint; the API holds the GitHub
  token server-side.

## 2. Layout

```
apps/ai/
├── app/
│   ├── main.py            # FastAPI app, routers, lifecycle
│   ├── routers/           # jobs, health, assistant
│   ├── models/            # Pydantic schemas (input/output contracts)
│   ├── services/          # pipeline orchestration
│   ├── providers/         # provider gateway + adapters
│   ├── pipelines/         # ingestion, analysis, analyzer, review, scoring, assistant
│   ├── context/           # retrieval, vector store, job store
│   ├── ingestion/         # repo fetch, filtering, language detection
│   └── config.py          # env config (pydantic-settings)
├── tests/
└── pyproject.toml

apps/api/src/modules/ai/    # API-side orchestration
├── tokens.js               # HMAC job/archive tokens (mirrors app/auth.py)
├── service.js              # createAnalysis · getAnalysis · getJobStatus · listAnalyses · approveAnalysis · streamArchive · conversations & streamAssistantReply
├── controller.js           # request/response mapping
├── routes.js               # org-scoped router + public signed archive router
└── schemas.js              # Zod input validation
```

## 3. The pipeline pattern

Every capability is a **pipeline**:

```
Input contract
  → context assembly        (what does the model need to see?)
  → prompt construction     (instruction layer, versioned)
  → provider invocation     (model call via gateway)
  → structured output       (JSON schema enforced by the model)
  → validation              (Pydantic; reject malformed/untrusted output)
  → application logic       (scoring, aggregation, mapping)
  → persistence/return      (typed job result)
```

Pipeline traits:

- **Deterministic where it can be**: filtering, language detection and
  scoring are code, not model output.
- **Model output is data, not code**: never executed; always schema-checked.
- **Previews not overwrites**: generation pipelines return drafts that the
  user explicitly approves.

## 4. Provider gateway

```python
class ModelGateway:
    def complete(self, request: CompletionRequest) -> CompletionResult: ...

class OpenAIAdapter(ModelGateway): ...
class AnthropicAdapter(ModelGateway): ...
```

- Configuration selects the active provider (env), with a **fallback
  provider** for resilience.
- Providers are exercised only against small, bounded payloads; repository
  content is chunked and summarized before it ever reaches a model.
- No API keys are exposed beyond the AI service environment.

## 5. Job intents & the signed archive flow

The API submits a **bounded job intent** — never repository contents in the
request body:

```json
{
  "job_id": "<uuid>",
  "type": "architecture | analyzer | code_review | docs | readme",
  "organization_id": "<uuid>",
  "repository_id": "<uuid>",
  "archive_url": "http://localhost:4000/api/v1/ai/archive/<repoId>?token=<archive-token>",
  "archive_token": "<archive-token>",
  "payload": { "repository_name": "acme/web" }
}
```

1. The API inserts a row into `ai_jobs` (`queued`), signs a short-lived
   HMAC **job token** and POSTs the intent to `AI_SERVICE_URL/jobs/{jobId}`
   with the `X-Devforge-Job-Token` header.
2. The AI service verifies the token, then pulls the repository archive from
   the signed `archive_url`. The API endpoint streams the GitHub tarball
   (owner-connection token stays server-side, never passed on).
3. The AI service ingests, analyzes and persists results into `ai_analyses`
   and `ai_jobs` in the shared database; the API only reads them back.

The **code review** variant (`code_review`) skips the archive flow: the API
fetches the pull request diff from GitHub (`application/vnd.github.diff`) and
submits it inline in `payload.diff` (no `archive_url`/`archive_token`). The
AI service reviews the diff, classifies findings by severity, computes a
review score and persists `pull_request_number` + diff stats top-level in the
report so the API can filter analyses per pull request.

The **docs/README** variants (`docs`, `readme`) use the standard archive flow
and return drafts as `{summary, files:[{path, content, note}]}`. The AI
service validates each draft (`.md` files only, canonical paths, exactly one
`README.md` for readme, `docs/` prefix for docs). The API never writes them
to the repository automatically: the user previews the draft and approves a
specific file, at which point the API commits it through the GitHub Contents
API (create or update, reusing the existing file's `sha`) and records the
approval in `report.approvals`.

The **engineering assistant** is a stateless, streamed endpoint rather than a
job: the API calls `POST {AI_SERVICE_URL}/assistant/stream` with the shared
HMAC job token (id `assistant`) and a body of `{conversation_id,
organization_id, repository_id, repository_name, messages}`. The AI service
runs the `assistant` pipeline, which hybrid-retrieves (vector + keyword) only
the chunks of that repository, wraps excerpts in `<untrusted>…</untrusted>` as
data-only context, truncates history to the last 20 messages and streams the
reply as Server-Sent Events: `sources` (retrieved context), repeated `delta`
text chunks, then `done` — or a single `error` event. The API relays the raw
SSE stream to the browser, persists the user message before the call and the
assistant reply (with its `sources` jsonb) only when the stream finishes
without an error. Conversations are repository-scoped via
`ai_conversations.repository_id` (migration `0012`).

Token formats (HMAC-SHA256, base64url; identical in `apps/api/.../ai/tokens.js`
and `apps/ai/app/auth.py`):

```
job token:     base64url(jobId) "." <exp ms> "." base64url(hmac("{jobId}.{exp}", secret))
archive token: <exp ms> "." base64url(hmac("archive.{repoId}.{exp}", secret))
```

## 6. Embeddings & RAG

- Chunk repository files and docs into retrieval units with metadata
  (path, language, module).
- Embed with a configured embedding provider; store in the vector store
  (pgvector `ai_document_chunks`, `vector(1536)` with an HNSW index).
- Retrieval: hybrid keyword + vector search scoped to a project/repo,
  with token-budgeted context assembly.

## 7. Security

- **Prompt injection defense**: external content (repo files, PR diffs) is
  flagged and insulated from instructions; the assistant never acts on
  instructions found in files.
- **No secrets to models**: repository content is scanned and redacted for
  obvious secret patterns before ingestion.
- **Never execute AI output.**
- All inbound requests authenticated via API-signed job tokens; archive
  downloads require a separate signed archive token.

## 8. Testing

- Unit: pipelines with mocked providers (pytest).
- Integration: real provider calls behind a feature flag, against fixture
  repositories.
- Contract tests for the API ↔ AI job protocol (`apps/ai/tests/test_auth.py`,
  `apps/api/test/ai-tokens.test.js`, `apps/api/test/ai.test.js`).

---

*Next: [realtime architecture](./realtime-architecture.md) · [data model](./data-model.md) · [ADR-003](../decisions/ADR-003-ai-service-boundary.md)*
