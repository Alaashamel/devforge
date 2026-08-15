"""DevForge AI service.

Owns repository ingestion, embeddings, vector search (RAG) and model
invocation behind a provider-agnostic gateway. It never holds GitHub tokens
or org secrets; repository content arrives as credential-free archives via
the core API.
"""
