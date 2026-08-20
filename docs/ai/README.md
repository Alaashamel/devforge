# AI Service Documentation

`apps/ai` — Python/FastAPI service for repository ingestion, embeddings,
vector search (RAG) and model invocation.

---

## Quick Start

```bash
# Development
cd apps/ai
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 5001

# Tests
python -m pytest              # all tests
python -m pytest tests/test_analyzer.py  # analyzer tests only
python -m ruff check .        # lint
```

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_PRIMARY_PROVIDER` | Yes | `openai`, `anthropic`, or `local` |
| `AI_OPENAI_API_KEY` | If OpenAI | OpenAI API key |
| `AI_ANTHROPIC_API_KEY` | If Anthropic | Anthropic API key |
| `AI_JOB_SECRET` | Yes | HMAC secret (must match API) |
| `AI_DATABASE_URL` | Yes | PostgreSQL connection string |

---

## Capabilities

| Capability | Analysis Type | Input | Output |
|------------|--------------|-------|--------|
| **Repository Analysis** | `analyzer` | Repo archive (tarball) | 4 health scores + strengths/risks/recommendations |
| **Code Review** | `code_review` | PR diff (inline) | Severity-classified findings + review score |
| **Documentation Generator** | `docs`, `readme` | Repo archive | Markdown draft files |
| **Engineering Assistant** | — | User question + repo context | Streamed text reply with sources |

---

## Pipeline Architecture

Every capability follows the same pipeline pattern:

```
Input contract
  → Context assembly    (what does the model need to see?)
  → Prompt construction (instruction layer, versioned)
  → Provider invocation (model call via gateway)
  → Structured output   (JSON schema enforced)
  → Validation          (Pydantic; reject malformed output)
  → Application logic   (scoring, aggregation, mapping)
  → Persistence/return  (typed job result)
```

**Design principles:**
- **Deterministic where possible:** filtering, language detection, and
  scoring are code, not model output.
- **Model output is data, not code:** never executed; always
  schema-checked.
- **Previews, not overwrites:** generation pipelines return drafts that
  the user explicitly approves.

---

## Provider Gateway

```python
# apps/ai/app/providers/base.py
class ModelGateway:
    def complete(self, request: CompletionRequest) -> CompletionResult: ...

class OpenAIAdapter(ModelGateway): ...
class AnthropicAdapter(ModelGateway): ...
class LocalAdapter(ModelGateway): ...
```

- Provider is selected via `AI_PRIMARY_PROVIDER` env var.
- A fallback provider is used for resilience.
- Providers are exercised only against bounded payloads; repository
  content is chunked and summarized before it reaches a model.
- No API keys are exposed beyond the AI service environment.

### Supported Providers

| Provider | Embedding Model | Completion Model | Notes |
|----------|----------------|------------------|-------|
| OpenAI | `text-embedding-3-small` | `gpt-4o-mini` | Default provider |
| Anthropic | — | `claude-3-haiku` | No native embeddings; uses hashing fallback |
| Local | `hashing_embed` | — | Deterministic offline embedder for testing |

---

## Security Model

- **Prompt injection defense:** external content (repo files, PR diffs)
  is wrapped in `<untrusted>…</untrusted>` tags and insulated from
  instructions.
- **Secret redaction:** repository content is scanned for obvious secret
  patterns before ingestion. Redacted chunks are never sent to a model.
- **No secrets to models:** GitHub tokens never reach the AI service.
  Archives are pulled from a signed API endpoint.
- **Job tokens:** all inbound requests authenticated via API-signed
  HMAC-SHA256 tokens (`X-Devforge-Job-Token` header).
- **Never execute AI output:** all model responses are validated as data,
  never evaluated as code.

---

## Repository Ingestion Pipeline

```
1. Fetch tarball from signed archive URL
2. Decode paths (percent-decoded)
3. Filter: ignore node_modules, build output, binaries, VCS
4. Language detection (per-extension mapping)
5. Dependency manifest parsing (package.json, requirements.txt, etc.)
6. Chunk files into retrieval units with metadata
7. Secret scan + redact sensitive patterns
8. Embed chunks via provider (pgvector storage)
9. Store in ai_document_chunks (1536-dim HNSW index)
```

---

## RAG Retrieval

Hybrid search combining:

1. **Vector search:** cosine similarity against pgvector embeddings
2. **Keyword search:** PostgreSQL full-text search on chunk content

Results are merged, deduplicated, and assembled into a token-budgeted
context window for the model.

**Chunk metadata stored:** path, language, line range, repository ID.

---

## Job Intent Protocol

The API submits bounded job intents — never raw repository content:

```json
{
  "job_id": "uuid",
  "type": "analyzer | code_review | docs | readme",
  "organization_id": "uuid",
  "repository_id": "uuid",
  "archive_url": "http://api:4000/api/v1/ai/archive/:repoId?token=...",
  "archive_token": "...",
  "payload": {
    "repository_name": "acme/web",
    "pull_request_number": 42
  }
}
```

**Flow:**
1. API creates `ai_jobs` row (`queued`), signs HMAC job token
2. API POSTs intent to `AI_SERVICE_URL/jobs/{jobId}`
3. AI service verifies token, pulls archive (if needed), processes
4. AI service persists results to `ai_analyses` and updates `ai_jobs`
5. API polls job status and returns results to the browser

**Code review variant:** skips archive flow; API fetches PR diff from
GitHub and submits it inline in `payload.diff`.

**Assistant variant:** stateless SSE endpoint (`POST /assistant/stream`);
not a queued job.

---

## Engineering Assistant

The assistant is a stateless, streamed endpoint:

```
POST {AI_SERVICE_URL}/assistant/stream
```

Body:

```json
{
  "conversation_id": "uuid",
  "organization_id": "uuid",
  "repository_id": "uuid",
  "repository_name": "acme/web",
  "messages": [
    { "role": "user", "content": "How is auth structured?" }
  ]
}
```

**Response: Server-Sent Events**

```
event: sources
data: [{"path":"src/auth/routes.js","chunk":"..."}]

event: delta
data: "The auth module uses JWT tokens..."

event: delta
data: " with Argon2id password hashing..."

event: done
data: {}
```

- Conversation history is truncated to the last 20 messages.
- Repository chunks are scoped to a single repository.
- Excerpts are wrapped in `<untrusted>` tags as data-only context.
- The API persists the assistant reply (with sources) only on successful
  stream completion.

---

## Testing

```bash
python -m pytest                    # all 145+ tests
python -m pytest -v                 # verbose
python -m pytest tests/test_auth.py # auth/token tests
python -m pytest -k "analyzer"      # analyzer tests
```

**Test categories:**
- **Unit:** pipelines with mocked providers (pytest)
- **Contract:** API ↔ AI job protocol (`test_auth.py`)
- **Integration:** real provider calls behind a feature flag

---

*See also: [AI service architecture](../architecture/ai-service-architecture.md) ·
[ADR-003](../decisions/ADR-003-ai-service-boundary.md)*
