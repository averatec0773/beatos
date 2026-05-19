"""Tests for MCP server tool registration."""
import pytest


@pytest.mark.asyncio
async def test_list_tools_includes_create_list_and_confirm():
    from beatos_mcp.server import list_tools_handler

    tools = await list_tools_handler()
    names = {t.name for t in tools}
    assert "create_list" in names
    assert "confirm_create_list" in names
    assert len(tools) == 8  # 6 existing read + 2 new write
