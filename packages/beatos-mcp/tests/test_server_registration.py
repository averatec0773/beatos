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
    assert "update_list" in names
    assert "delete_list" in names
    assert "add_tracks_to_list" in names
    assert "remove_tracks_from_list" in names
    assert "reorder_list" in names
    # 5 read tools + create_list + await_approval + 3 lifecycle tools + 5 list-curation tools + 2 metadata tools
    assert len(tools) == 17
