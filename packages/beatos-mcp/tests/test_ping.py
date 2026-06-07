"""Tests for the `ping` MCP tool."""
import tomllib
from pathlib import Path

import pytest

from beatos_mcp import __version__
from beatos_mcp.tools.ping import ping


def _pyproject_version() -> str:
    pp = Path(__file__).resolve().parents[1] / "pyproject.toml"
    with pp.open("rb") as f:
        return tomllib.load(f)["project"]["version"]


@pytest.mark.asyncio
async def test_ping_returns_pong_payload():
    result = await ping()

    assert result["status"] == "pong"
    assert result["version"] == __version__


def test_version_tracks_pyproject():
    """Regression guard for the 0.0.44 drift bug: __version__ (and thus the
    version `ping` reports to every MCP client) must resolve to the real package
    version, not a stale hand-maintained literal. Resolved via importlib.metadata
    in __init__, so this only holds when the installed env is in sync — which
    `uv run pytest` / CI guarantee."""
    assert __version__ == _pyproject_version()
