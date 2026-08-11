# AI Service Architecture (apps/ai)

The AI service is a Python/FastAPI application that owns repository
ingestion, embeddings, vector search (RAG) and model invocation. It is
deliberately isolated from the API so that providers, models and prompt
engineering can evolve without touching the core platform.

## 1. Boundaries

```
Browser ──► API (apps/api)
                │  POST /api/v1/ai/jobs  (bounded job intents)
                ▼
           AI service (apps/ai)
                │  FastAPI routes
                ▼
           Pipelines: ingestion · analysis · review · docs · assistant
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

## 2. Layout

```
apps/ai/
├── app/
│   ├── main.py            # FastAPI app, routers, lifecycle
│   ├── routers/           # jobs, health, ingestion
│   ├── models/            # Pydantic schemas (input/output contracts)
│   ├── services/          # pipeline orchestration
│   ├── providers/         # provider gateway + adapters
│   ├── pipelines/         # repository, review, docs, assistant
│   ├── context/           # retrieval, vector store client
│   ├── ingestion/         # repo fetch, filtering, language detection
│   └── config.py          # env config (pydantic-settings)
├── tests/
└── pyproject.toml
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

## 5. Repository ingestion

1. Fetch repository content (tarball or per-file) from the API-provided
   archive URL — never with GitHub credentials.
2. Filter files (ignore `node_modules`, build output, binary files, VCS).
3. Detect language and count files by extension.
4. Parse dependency manifests and lockfiles.
5. Emit a normalized **repository snapshot** (file map, dependencies,
   entry points, package metadata) used by analysis and RAG.

## 6. Embeddings & RAG

- Chunk repository files and docs into retrieval units with metadata
  (path, language, module).
- Embed with a configured embedding provider; store in the vector store
  (pgvector or dedicated store — see ADR-003).
- Retrieval: hybrid keyword + vector search scoped to a project/repo,
  with token-budgeted context assembly.

## 7. Security

- **Prompt injection defense**: external content (repo files, PR diffs) is
  flagged and insulated from instructions; the assistant never acts on
  instructions found in files.
- **No secrets to models**: repository content is scanned and redacted for
  obvious secret patterns before ingestion.
- **Never execute AI output.**
- All inbound requests authenticated via API-signed job tokens.

## 8. Testing

- Unit: pipelines with mocked providers (pytest).
- Integration: real provider calls behind a feature flag, against fixture
  repositories.
- Contract tests for the API ↔ AI job protocol.

---

*Next: [realtime architecture](./realtime-architecture.md) · [data model](./data-model.md) · [ADR-003](../decisions/ADR-003-ai-service-boundary.md)*
