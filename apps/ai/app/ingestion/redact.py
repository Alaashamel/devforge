"""Secret scanning and redaction for repository content."""

import re

_PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        "private-key",
        re.compile(
            r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----",
            re.DOTALL,
        ),
    ),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("openai-key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    (
        "assigned-secret",
        re.compile(
            r"(?i)\b(api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|access[_-]?token|auth[_-]?token|bearer)\b"
            r"\s*[:=]\s*['\"]?[A-Za-z0-9_\-./+]{12,}['\"]?"
        ),
    ),
    (
        "connection-string",
        re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s'\"<>]+@[^\s'\"<>]+"),
    ),
]

_REDACTED = "[REDACTED]"


def scan_secrets(content: str) -> list[str]:
    """Return the names of secret patterns present in content."""
    return [name for name, pattern in _PATTERNS if pattern.search(content)]


def redact_secrets(content: str) -> tuple[str, int]:
    """Replace detected secret material with [REDACTED]; return (content, hits)."""
    count = 0
    for _name, pattern in _PATTERNS:
        content, replacements = pattern.subn(_REDACTED, content)
        count += replacements
    return content, count
