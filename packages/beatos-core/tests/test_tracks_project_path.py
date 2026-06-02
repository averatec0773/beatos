import pytest
from beatos_core.db import run_migrations
from beatos_core.tracks.service import create_track, update_track, get_track


@pytest.fixture
async def db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


@pytest.mark.asyncio
async def test_new_track_has_no_project_path(db):
    t = await create_track("beat")
    assert t.project_path is None


@pytest.mark.asyncio
async def test_update_sets_and_persists_project_path(db):
    t = await create_track("beat")
    t2 = await update_track(t.id, {"project_path": "/Users/me/Music/Projects/beat.als"})
    assert t2.project_path == "/Users/me/Music/Projects/beat.als"
    assert (await get_track(t.id)).project_path == "/Users/me/Music/Projects/beat.als"


@pytest.mark.asyncio
async def test_update_clears_project_path(db):
    t = await create_track("beat")
    await update_track(t.id, {"project_path": "/tmp/x"})
    t2 = await update_track(t.id, {"project_path": None})
    assert t2.project_path is None
