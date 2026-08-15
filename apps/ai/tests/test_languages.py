"""Tests for language detection."""

from app.ingestion.languages import language_for


def test_extension_mapping():
    assert language_for("src/main.py") == "Python"
    assert language_for("package.json") == "JSON"
    assert language_for("lib/util.ts") == "TypeScript"
    assert language_for("app/page.tsx") == "TSX"
    assert language_for("components/Button.jsx") == "JSX"
    assert language_for("main.go") == "Go"
    assert language_for("Cargo.toml") == "TOML"


def test_special_names():
    assert language_for("Dockerfile") == "Dockerfile"
    assert language_for("Makefile") == "Makefile"
    assert language_for("Gemfile") == "Ruby"


def test_unknown_extension():
    assert language_for("data.xyz") is None
    assert language_for("LICENSE") is None
