"""Tests for beatos_core.tracks.service."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import (
    create_track,
    delete_track,
    get_track,
    list_tracks,
    update_track,
)


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_create_returns_track_with_id():
    t = await create_track("Untitled")
    assert t.id > 0
    assert t.title == "Untitled"
    assert t.license_type == "lease_basic"


@pytest.mark.asyncio
async def test_list_returns_all_tracks_ordered_by_updated_at_desc():
    a = await create_track("A")
    b = await create_track("B")

    rows = await list_tracks()

    # Newest first (B was created last).
    assert [r.id for r in rows] == [b.id, a.id]


@pytest.mark.asyncio
async def test_update_partial_preserves_other_fields():
    t = await create_track("Untitled")

    updated = await update_track(t.id, {"bpm": 140})

    assert updated.bpm == 140
    assert updated.title == "Untitled"


@pytest.mark.asyncio
async def test_update_rejects_description_draft():
    """description_draft is sacred — only AI tools may set it."""
    t = await create_track("Untitled")

    with pytest.raises(ValueError):
        await update_track(t.id, {"description_draft": "AI text"})


@pytest.mark.asyncio
async def test_update_rejects_unknown_field():
    t = await create_track("Untitled")

    with pytest.raises(ValueError):
        await update_track(t.id, {"nonexistent_field": "x"})


@pytest.mark.asyncio
async def test_delete_removes_track():
    t = await create_track("Untitled")

    await delete_track(t.id)

    rows = await list_tracks()
    assert rows == []
    assert await get_track(t.id) is None


@pytest.mark.asyncio
async def test_get_returns_none_for_missing_id():
    assert await get_track(99999) is None
