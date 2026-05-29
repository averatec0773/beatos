import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, update_track
from beatos_mcp.tools.export import export_metadata as export_impl
from beatos_mcp.tools.export import list_export_platforms as platforms_impl


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_export_metadata_tool_matches_service():
    track = await create_track("Beat")
    await update_track(track.id, {"genre": ["Trap Rap"]})
    result = await export_impl(track.id, "netease")
    assert result["platform"] == "netease"
    genre = next(f for f in result["fields"] if f["key"] == "genre")
    assert genre["value"] == "陷阱说唱"


@pytest.mark.asyncio
async def test_list_platforms_tool():
    result = await platforms_impl()
    assert "netease" in result["platforms"]
