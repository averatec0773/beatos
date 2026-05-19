"""Tests for MCP server tool registration."""
import pytest


@pytest.mark.asyncio
async def test_list_tools_includes_create_list_and_await_approval():
    from beatos_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert "create_list" in names
    assert "await_approval" in names
    assert "confirm_create_list" not in names
    assert "trash_tracks" in names
    assert "restore_tracks" in names
    assert "purge_tracks" in names
    # 5 read tools + create_list + await_approval + 3 lifecycle tools
    assert len(tools) == 10
