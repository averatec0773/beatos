import pytest

from beatos_mcp.server import mcp


async def test_mcp_instance_is_fastmcp() -> None:
    from mcp.server.fastmcp import FastMCP
    assert isinstance(mcp, FastMCP)


async def test_registered_tool_names() -> None:
    from beatos_mcp.pro import pro_available

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    expected = {
        "ping",
        "list_tracks",
        "get_track",
        "list_lists",
        "list_distinct_values",
        "search_tracks",
        "create_list",
        "trash_tracks",
        "restore_tracks",
        "purge_tracks",
        "update_list",
        "delete_list",
        "add_tracks_to_list",
        "remove_tracks_from_list",
        "reorder_list",
        "update_tracks",
        "merge_metadata",
        "create_tracks",
        "attach_assets",
        "detach_assets",
        "set_license_tiers",
        "list_export_platforms",
        "export_metadata",
    }
    if pro_available():
        expected.add("publish_track")
        expected.add("publish_status")
        expected.add("list_publish_platforms")
        expected.add("publish_session_status")
        expected.add("list_publish_jobs")
    assert names == expected


async def test_read_tools_have_readonly_annotation() -> None:
    tools = await mcp.list_tools()
    by_name = {t.name: t for t in tools}
    for name in ["ping", "list_tracks", "get_track", "list_lists",
                 "list_distinct_values", "search_tracks",
                 "list_export_platforms", "export_metadata"]:
        assert by_name[name].annotations is not None, f"{name} has no annotations"
        assert by_name[name].annotations.readOnlyHint is True, f"{name} missing readOnlyHint"


async def test_streamable_http_app_exists() -> None:
    from beatos_mcp.server import app
    # Should be an ASGI callable
    assert callable(app)


async def test_merge_metadata_param_is_aliases_not_reserved_word() -> None:
    """merge_metadata's list-of-aliases param is named `aliases` (NOT `from`).
    `from` is a Python reserved word: FastMCP dispatches by alias, so a `from`
    alias made the sidecar raise `unexpected keyword argument 'from'` on every
    call (QA P0-3). Pin that neither `from` nor `from_` leaks into the schema."""
    tools = await mcp.list_tools()
    tool = next(t for t in tools if t.name == "merge_metadata")
    props = tool.inputSchema.get("properties", {})
    assert "aliases" in props, f"expected 'aliases'; got {list(props.keys())}"
    assert "from" not in props and "from_" not in props
