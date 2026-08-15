"""Dependency manifest parsing."""

import json
import re
import tomllib
from typing import Any

_MANIFEST_FILES = {
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "cargo.toml",
    "gemfile",
}

_REQ_LINE = re.compile(r"^([A-Za-z0-9_.\-\[\]]+)\s*(==|>=|<=|~=|!=|<|>)?\s*([^\s;#]*)")


def is_manifest(path: str) -> bool:
    return path.rsplit("/", 1)[-1].lower() in _MANIFEST_FILES


def parse_manifest(path: str, content: str) -> dict[str, Any]:
    name = path.rsplit("/", 1)[-1].lower()
    try:
        if name == "package.json":
            return _parse_package_json(content)
        if name == "requirements.txt":
            return _parse_requirements(content)
        if name in {"pyproject.toml", "cargo.toml", "go.mod"}:
            return _parse_toml_like(name, content)
        if name == "gemfile":
            return _parse_gemfile(content)
    except (ValueError, tomllib.TOMLDecodeError, json.JSONDecodeError):
        return {}
    return {}


def _parse_package_json(content: str) -> dict[str, Any]:
    data = json.loads(content)
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    return {
        "name": data.get("name"),
        "version": data.get("version"),
        "dependencies": sorted(deps.keys()),
        "dependency_count": len(deps),
    }


def _parse_requirements(content: str) -> dict[str, Any]:
    packages: list[str] = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        match = _REQ_LINE.match(line)
        if match:
            packages.append(match.group(1))
    return {"dependencies": packages, "dependency_count": len(packages)}


def _parse_toml_like(name: str, content: str) -> dict[str, Any]:
    data = tomllib.loads(content)
    deps: list[str] = []
    if name == "pyproject.toml":
        project = data.get("project", {})
        deps = [str(d) for d in project.get("dependencies", [])]
        return {"dependencies": deps, "dependency_count": len(deps)}
    if name == "cargo.toml":
        deps = [str(d) for d in data.get("dependencies", {})]
        return {"dependencies": deps, "dependency_count": len(deps)}
    if name == "go.mod":
        require = data.get("require", {})
        if isinstance(require, dict):
            deps = [str(d) for d in require]
        return {"module": data.get("module"), "dependencies": deps, "dependency_count": len(deps)}
    return {}


def _parse_gemfile(content: str) -> dict[str, Any]:
    deps = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("gem ") and "source" not in stripped:
            parts = stripped.split()
            if len(parts) >= 2:
                deps.append(parts[1].strip('"\''))
    return {"dependencies": deps, "dependency_count": len(deps)}
