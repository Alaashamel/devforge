"""Context assembly for RAG queries under a token budget."""

from ..ingestion.chunk import estimate_tokens

SOURCE_SEPARATOR = "\n\n---\n\n"


def assemble_context(results: list[dict], budget: int, max_sources: int = 12) -> list[dict]:
    """Pick the highest-scoring sources until the token budget is exhausted.

    Always returns at least one source so a tight budget never yields nothing.
    """
    selected: list[dict] = []
    used = 0
    for item in sorted(results, key=lambda r: r.get("score", 0.0), reverse=True):
        if len(selected) >= max_sources:
            break
        tokens = (
            estimate_tokens(item.get("content", ""))
            + estimate_tokens(item.get("path", ""))
            + 4
        )
        if selected and used + tokens > budget:
            break
        selected.append(
            {
                "path": item["path"],
                "language": item.get("language"),
                "content": item.get("content", ""),
                "score": item.get("score", 0.0),
            }
        )
        used += tokens
    return selected


def render_context(sources: list[dict]) -> str:
    """Render selected sources as an insulated, readable text block."""
    blocks = []
    for source in sources:
        blocks.append(f"### {source['path']}\n{source['content']}")
    return SOURCE_SEPARATOR.join(blocks)
