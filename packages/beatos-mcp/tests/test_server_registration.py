"""Tests for MCP server tool registration."""
import pytest


@pytest.mark.asyncio
async def test_list_tools_includes_create_list_and_confirm():
    from beatos_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert "create_list" in names
    assert "confirm_create_list" in names
    # 5 read tools + create_list + confirm_create_list (deprecated alias) + await_approval
    assert len(tools) == 8
