# @devforge/ai — AI service

Python/FastAPI service owning repository ingestion, embeddings, vector
search (RAG), provider invocation and analysis pipelines. It is isolated
from the API by design: the browser never talks to it, and it never holds
GitHub credentials or org secrets.

See [`docs/architecture/ai-service-architecture.md`](../../docs/architecture/ai-service-architecture.md)
and [ADR-003](../../docs/decisions/ADR-003-ai-service-boundary.md) for the
full design.

## Layout

```
app/
├── main.py            # FastAPI app, routers, lifecycle
├── config.py          # pydantic-settings (AI_* env vars)
├── auth.py            # job/archive token verification (HMAC-SHA256)
├── deps.py            # shared dependencies
├── models/            # Pydantic schemas (job contract)
├── providers/         # provider gateway + OpenAI/Anthropic/local adapters
├── ingestion/         # fetch, filter, languages, manifests, chunk, redact, snapshot
├── context/           # vector store (pgvector), job store, retrieval
├── pipelines/         # ingest, analysis, analyzer, review, scoring orchestration
├── services/          # job orchestration
└── routers/           # health, jobs
tests/                 # pytest suite (109 tests)
```

## Job contract

The API submits a bounded **job intent** and the service responds with
typed, validated results:

- `POST {AI_SERVICE_URL}/jobs/{jobId}` with `X-Devforge-Job-Token` header —
  verified against `AI_JOB_SECRET`; body carries the repository id, job type
  and a signed archive URL.
- The service pulls the repository archive from the signed URL, ingests it,
  runs the pipeline and updates `ai_jobs`/`ai_analyses` in the shared
  database; the API only reads results back.
- `code_review` jobs carry the pull request diff inline in `payload.diff`
  (no archive download/ingestion) and persist `pull_request_number` +
  `files_changed`/`additions`/`deletions` + a review `score` in the report.

Token formats are mirrored in
`apps/api/src/modules/ai/tokens.js` (Node) and `app/auth.py` (Python).

## Running locally

```bash
# from the repository root
docker compose up -d postgres
npm run db:migrate
npm run ai:dev          # uvicorn on :5001 with reload
```

Environment (`AI_SERVICE_URL` is what the API uses to reach this service):

```
AI_SERVICE_URL=http://localhost:5001
AI_JOB_SECRET=           # HMAC secret; must be explicit in production
AI_JOB_TTL_SECONDS=300
AI_ARCHIVE_TTL_SECONDS=900
```

## Tests

```bash
npm run ai:test                     # from repo root
# or, from this directory:
python -m pytest                    # offline suites
AI_TEST_DATABASE_URL=postgres://devforge:devforge@localhost:5433/devforge_test python -m pytest
```

`test_vector_store.py` exercises pgvector end-to-end and needs
`AI_TEST_DATABASE_URL` (Docker postgres running).
