import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, get_track, bulk_update_tracks


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_bulk_add_genre_to_many():
    a = await create_track("A")
    b = await create_track("B")
    res = await bulk_update_tracks([a.id, b.id], {"genre": {"add": ["Trap Rap"]}})
    assert res["updated_count"] == 2
    assert (await get_track(a.id)).genre == ["Trap Rap"]
    assert (await get_track(b.id)).genre == ["Trap Rap"]


@pytest.mark.asyncio
async def test_bulk_replace_then_remove():
    a = await create_track("A")
    await bulk_update_tracks([a.id], {"mood": ["Happiness", "Sad"]})
    await bulk_update_tracks([a.id], {"mood": {"remove": ["Sad"]}})
    assert (await get_track(a.id)).mood == ["Happiness"]


@pytest.mark.asyncio
async def test_bulk_scalar_bpm():
    a = await create_track("A")
    await bulk_update_tracks([a.id], {"bpm": 150})
    assert (await get_track(a.id)).bpm == 150
