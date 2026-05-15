"""Tests for adding / removing tracks in lists."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.lists.membership import (
    add_track_to_list,
    lists_for_track,
    remove_track_from_list,
    tracks_in_list,
)
from beatos_core.lists.service import create_list
from beatos_core.tracks.service import create_track


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_add_track_appears_in_list():
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")

    await add_track_to_list(track.id, lst.id)
    items = await tracks_in_list(lst.id)

    assert len(items) == 1
    assert items[0].id == track.id


@pytest.mark.asyncio
async def test_remove_track_drops_membership():
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")
    await add_track_to_list(track.id, lst.id)

    await remove_track_from_list(track.id, lst.id)

    items = await tracks_in_list(lst.id)
    assert items == []


@pytest.mark.asyncio
async def test_add_track_twice_is_idempotent():
    track = await create_track("T1")
    lst = await create_list(name="Trap", kind="user")

    await add_track_to_list(track.id, lst.id)
    await add_track_to_list(track.id, lst.id)  # second call must not error

    items = await tracks_in_list(lst.id)
    assert len(items) == 1


@pytest.mark.asyncio
async def test_lists_for_track_returns_member_lists():
    track = await create_track("T1")
    a = await create_list(name="Trap", kind="user")
    b = await create_list(name="Lofi", kind="user")
    await add_track_to_list(track.id, a.id)
    await add_track_to_list(track.id, b.id)

    found = await lists_for_track(track.id)
    names = sorted(l.name for l in found)
    assert names == ["Lofi", "Trap"]
