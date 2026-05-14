"""Tests for the `ping` MCP tool."""
import pytest

from beatos_mcp.tools.ping import ping


@pytest.mark.asyncio
async def test_ping_returns_pong_payload():
    result = await ping()

    assert result["status"] == "pong"
    assert "version" in result
    assert result["version"] == "0.0.1"
