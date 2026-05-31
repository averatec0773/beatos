import datetime as dt
import pytest
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, update_track, get_track, bulk_update_tracks


@pytest.fixture
async def db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


@pytest.mark.asyncio
async def test_new_track_defaults_not_free(db):
    t = await create_track("beat")
    assert t.is_free is False


@pytest.mark.asyncio
async def test_update_sets_is_free(db):
    t = await create_track("beat")
    t2 = await update_track(t.id, {"is_free": True})
    assert t2.is_free is True
    t3 = await get_track(t.id)
    assert t3.is_free is True


@pytest.mark.asyncio
async def test_update_clears_is_free(db):
    t = await create_track("beat")
    await update_track(t.id, {"is_free": True})
    t2 = await update_track(t.id, {"is_free": False})
    assert t2.is_free is False


@pytest.mark.asyncio
async def test_bulk_update_is_free(db):
    a = await create_track("a")
    b = await create_track("b")
    res = await bulk_update_tracks([a.id, b.id], {"is_free": True})
    assert res["updated_count"] == 2
    assert (await get_track(a.id)).is_free is True
