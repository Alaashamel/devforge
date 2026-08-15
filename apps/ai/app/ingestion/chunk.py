"""Text chunking with overlap for retrieval units."""


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token."""
    return max(1, len(text) // 4)


def chunk_text(text: str, chunk_chars: int = 1500, overlap_chars: int = 150) -> list[str]:
    """Split text into chunks bounded by chunk_chars with overlap.

    Prefers breaking at newlines near the target size; falls back to word
    boundaries. Files smaller than the chunk size produce a single chunk.
    """
    if chunk_chars <= 0 or overlap_chars < 0 or overlap_chars >= chunk_chars:
        raise ValueError("invalid chunk configuration")
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_chars:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        if end < len(text):
            newline = text.rfind("\n", start, end)
            if newline > start:
                end = newline + 1
            else:
                space = text.rfind(" ", start, end)
                if space > start:
                    end = space + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap_chars, start + 1)
    return [c for c in chunks if c]
