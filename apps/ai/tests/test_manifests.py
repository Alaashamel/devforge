"""Tests for dependency manifest parsing."""

from app.ingestion.manifests import is_manifest, parse_manifest


def test_package_json():
    content = (
        '{"name":"demo","version":"1.0.0",'
        '"dependencies":{"fastify":"^5","zod":"^3"},'
        '"devDependencies":{"vitest":"^2"}}'
    )
    result = parse_manifest("package.json", content)
    assert result["name"] == "demo"
    assert result["dependency_count"] == 3
    assert "fastify" in result["dependencies"]
    assert "vitest" in result["dependencies"]


def test_package_json_broken_returns_empty():
    assert parse_manifest("package.json", "{not json") == {}


def test_requirements_txt():
    content = "# comment\nfastapi==0.115\nhttpx>=0.27\n-r base.txt\n"
    result = parse_manifest("requirements.txt", content)
    assert result["dependency_count"] == 2
    assert "fastapi" in result["dependencies"]


def test_pyproject_toml():
    content = '[project]\ndependencies = ["fastapi>=0.115", "uvicorn"]\n'
    result = parse_manifest("pyproject.toml", content)
    assert result["dependency_count"] == 2


def test_manifest_detection():
    assert is_manifest("package.json")
    assert is_manifest("requirements.txt")
    assert is_manifest("pyproject.toml")
    assert is_manifest("go.mod")
    assert is_manifest("Gemfile")
    assert not is_manifest("src/main.py")
    assert not is_manifest("README.md")
