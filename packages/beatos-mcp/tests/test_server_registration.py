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
    assert "create_tracks" in names
    assert "attach_assets" in names
    assert "detach_assets" in names
    assert "attach_asset" not in names  # singular retired in v0.0.24.2
    assert "set_license_tiers" in names
    assert "list_export_platforms" in names
    assert "export_metadata" in names
    # 8 read tools + create_list + await_approval + 3 lifecycle tools + 5 list-curation tools + 2 metadata tools + 3 ingest tools + set_license_tiers
    # (+ publish_track when the pro engine is present)
    from beatos_mcp.pro import pro_available
    expected_count = 25 if pro_available() else 24
    assert len(tools) == expected_count
