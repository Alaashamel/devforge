"""Tests for file filtering."""

from app.ingestion.filter import is_binary, is_ignored


def test_ignores_vcs_and_dependency_dirs():
    assert is_ignored(".git/config")
    assert is_ignored(".git/objects/ab/cdef")
    assert is_ignored("node_modules/pkg/index.js")
    assert is_ignored("dist/bundle.js")
    assert is_ignored("build/out.o")
    assert is_ignored("src/__pycache__/module.pyc")
    assert is_ignored(".venv/lib/python/site.py")


def test_ignores_env_and_secret_files():
    assert is_ignored(".env")
    assert is_ignored("config/.env.local")
    assert is_ignored(".env.example")
    assert is_ignored(".npmrc")
    assert is_ignored(".netrc")


def test_ignores_binary_and_credential_extensions():
    assert is_ignored("logo.png")
    assert is_ignored("font.woff2")
    assert is_ignored("secret.pem")
    assert is_ignored("secret.key")
    assert is_ignored("lockfile.lock")


def test_keeps_source_and_doc_files():
    assert not is_ignored("src/main.py")
    assert not is_ignored("README.md")
    assert not is_ignored("lib/util.ts")
    assert not is_ignored(".github/workflows/ci.yml")


def test_binary_detection():
    assert is_binary(b"\x00\x01\x02")
    assert is_binary(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"0" * 100)
    assert not is_binary(b"print('hello')\n")
    assert not is_binary(b"\t\n" * 50)
