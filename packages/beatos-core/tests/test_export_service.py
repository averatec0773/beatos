import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, update_track
from beatos_core.export.service import export_metadata, available_platforms


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


def test_available_platforms_includes_netease():
    assert "netease" in available_platforms()


@pytest.mark.asyncio
async def test_export_known_track():
    track = await create_track("Beat A")
    await update_track(track.id, {"genre": ["Trap Rap"], "bpm": 140})
    result = await export_metadata(track.id, "netease")
    by_key = {f.key: f for f in result.fields}
    assert by_key["genre"].value == "陷阱说唱"
    assert by_key["bpm"].value == "140"


@pytest.mark.asyncio
async def test_unknown_platform_raises():
    track = await create_track("Beat B")
    with pytest.raises(ValueError):
        await export_metadata(track.id, "myspace")


@pytest.mark.asyncio
async def test_missing_track_raises():
    with pytest.raises(ValueError):
        await export_metadata(999999, "netease")
