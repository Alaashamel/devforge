"""File filtering for repository ingestion."""

IGNORED_DIRS = {
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "out",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    "vendor",
    ".gradle",
    ".idea",
    ".vscode",
    "coverage",
    ".pytest_cache",
    "target",
    "tmp",
}

IGNORED_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".webp",
    ".avif",
    ".bmp",
    ".tiff",
    ".pdf",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".otf",
    ".mp3",
    ".mp4",
    ".mov",
    ".avi",
    ".webm",
    ".zip",
    ".tar",
    ".gz",
    ".tgz",
    ".bz2",
    ".xz",
    ".7z",
    ".rar",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".class",
    ".jar",
    ".war",
    ".lock",
    ".min.js",
    ".min.css",
    ".map",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".wasm",
}

IGNORED_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.example",
    "id_rsa",
    "id_dsa",
    "id_ed25519",
    "id_ecdsa",
    ".npmrc",
    ".pypirc",
    ".netrc",
}

# Credential-holding extensions: never ingest, even redacted.
CREDENTIAL_EXTS = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".p8", ".ppk"}

BINARY_NULL_PROBE = 8000


def is_binary(data: bytes) -> bool:
    """Heuristic: null bytes in the head usually mean binary content."""
    probe = data[:BINARY_NULL_PROBE]
    return b"\x00" in probe


def is_ignored(path: str) -> bool:
    parts = [p for p in path.split("/") if p]
    if not parts:
        return True
    if any(p in IGNORED_DIRS for p in parts):
        return True
    name = parts[-1]
    if name in IGNORED_FILES or name.startswith(".env"):
        return True
    ext = _suffix(name).lower()
    return ext in IGNORED_EXTS or ext in CREDENTIAL_EXTS


def _suffix(name: str) -> str:
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""
