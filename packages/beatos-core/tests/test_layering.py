"""Guard for Critical agent rule 2: beatos-core has no web/RPC/Electron deps.

Static text scan — nothing is imported/executed. The scanner itself is
unit-tested against violating samples, so this guard is known to go red when a
forbidden import actually appears (not just trusted to).
"""
from __future__ import annotations

import re
from pathlib import Path

FORBIDDEN = ("fastapi", "starlette", "uvicorn", "mcp", "electron", "flask", "aiohttp")

_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+({names})(?:[.\s]|$)|import\s+({names})(?:[.\s,]|$))".format(
        names="|".join(FORBIDDEN)
    ),
    re.MULTILINE,
)

SRC_ROOT = Path(__file__).resolve().parents[1] / "beatos_core"


def find_forbidden_imports(text: str) -> list[str]:
    return [m.group(1) or m.group(2) for m in _IMPORT_RE.finditer(text)]


def test_scanner_goes_red_on_violations():
    assert find_forbidden_imports("import fastapi\n") == ["fastapi"]
    assert find_forbidden_imports("from mcp.server import Server\n") == ["mcp"]
    assert find_forbidden_imports("    import uvicorn\n") == ["uvicorn"]
    assert find_forbidden_imports("from fastapi import APIRouter\n") == ["fastapi"]
    assert find_forbidden_imports("import mcpx\n") == []  # prefix is not a match
    assert find_forbidden_imports("# import fastapi\n") == []  # comment
    assert find_forbidden_imports("import beatos_platforms\n") == []


def test_beatos_core_source_has_no_forbidden_imports():
    assert SRC_ROOT.is_dir(), f"source root not found: {SRC_ROOT}"
    violations = []
    for py in sorted(SRC_ROOT.rglob("*.py")):
        if "__pycache__" in py.parts:
            continue
        for name in find_forbidden_imports(py.read_text(encoding="utf-8")):
            violations.append(f"{py.relative_to(SRC_ROOT.parent)}: imports {name}")
    assert violations == [], (
        "beatos-core must stay free of web/RPC/Electron imports "
        f"(Critical agent rule 2); found: {violations}"
    )
