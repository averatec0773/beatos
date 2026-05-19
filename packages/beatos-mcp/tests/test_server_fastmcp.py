import pytest

from beatos_mcp.server import mcp


async def test_mcp_instance_is_fastmcp() -> None:
    from mcp.server.fastmcp import FastMCP
    assert isinstance(mcp, FastMCP)


async def test_registered_tool_names() -> None:
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    expected = {
        "ping",
        "list_tracks",
        "get_track",
        "list_lists",
        "list_distinct_values",
        "create_list",
        "await_approval",
        "trash_tracks",
        "restore_tracks",
        "purge_tracks",
    }
    assert names == expected


async def test_read_tools_have_readonly_annotation() -> None:
    tools = await mcp.list_tools()
    by_name = {t.name: t for t in tools}
    for name in ["ping", "list_tracks", "get_track", "list_lists",
                 "list_distinct_values", "await_approval"]:
        assert by_name[name].annotations is not None, f"{name} has no annotations"
        assert by_name[name].annotations.readOnlyHint is True, f"{name} missing readOnlyHint"


async def test_streamable_http_app_exists() -> None:
    from beatos_mcp.server import app
    # Should be an ASGI callable
    assert callable(app)
