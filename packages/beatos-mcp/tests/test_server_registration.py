"""Tests for MCP server tool registration."""
import pytest


@pytest.mark.asyncio
async def test_list_tools_includes_create_list():
    from beatos_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert "create_list" in names
    # L1 model: writes apply directly; the 2PC await_approval tool is gone.
    assert "await_approval" not in names
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
    # 8 read tools + create_list + 3 lifecycle tools + 5 list-curation tools + 2 metadata tools + 3 ingest tools + set_license_tiers
    # (+ publish_track / publish_status / list_publish_platforms / publish_session_status
    #  / list_publish_jobs when the pro engine is present)
    from beatos_mcp.pro import pro_available
    if pro_available():
        assert "publish_track" in names
        assert "publish_status" in names
        assert "list_publish_platforms" in names
        assert "publish_session_status" in names
        assert "list_publish_jobs" in names
    expected_count = 28 if pro_available() else 23
    assert len(tools) == expected_count


# Golden tool surface. Adding/removing/renaming a tool must edit these sets
# DELIBERATELY — and update conventions/architecture.md §"MCP surface" counts
# (see the new-write-tool skill). This guards against a tool silently
# appearing on or dropping off the agent surface.
FREE_TOOLS = {
    "ping",
    "list_tracks",
    "get_track",
    "list_lists",
    "list_distinct_values",
    "search_tracks",
    "list_export_platforms",
    "export_metadata",
    "create_list",
    "update_list",
    "delete_list",
    "add_tracks_to_list",
    "remove_tracks_from_list",
    "reorder_list",
    "trash_tracks",
    "restore_tracks",
    "purge_tracks",
    "update_tracks",
    "merge_metadata",
    "set_license_tiers",
    "create_tracks",
    "attach_assets",
    "detach_assets",
}
PRO_TOOLS = {
    "list_publish_platforms",
    "publish_session_status",
    "list_publish_jobs",
    "publish_track",
    "publish_status",
}


@pytest.mark.asyncio
async def test_tool_surface_matches_golden_list():
    from beatos_mcp.pro import pro_available
    from beatos_mcp.server import mcp

    names = {t.name for t in await mcp.list_tools()}
    expected = FREE_TOOLS | (PRO_TOOLS if pro_available() else set())
    assert names == expected, (
        f"unexpected: {sorted(names - expected)} · missing: {sorted(expected - names)}"
    )
