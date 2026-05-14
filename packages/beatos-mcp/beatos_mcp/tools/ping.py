"""Trivial liveness tool — proves the MCP server is reachable."""
from __future__ import annotations

from beatos_mcp import __version__


async def ping() -> dict[str, str]:
    """Return a small payload identifying the running BeatOS MCP server."""
    return {"status": "pong", "version": __version__}
