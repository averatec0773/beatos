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
from beatos_core.tracks.service import create_track, update_track


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    """Each test gets its own isolated global DB with migrations applied."""
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)

    yield


@pytest.fixture
def attach_audio_helper(tmp_path):
    """Return an async helper that attaches an audio file asset to a track."""
    from beatos_core.assets.service import attach_asset

    async def _helper(track_id: int, role: str = "audio_tagged_wav") -> None:
        audio = tmp_path / f"audio_{track_id}_{role}.wav"
        audio.write_bytes(b"\x00" * 64)
        await attach_asset(track_id, role=role, path=audio)

    return _helper


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


@pytest.mark.asyncio
async def test_tracks_in_list_returns_has_audio(attach_audio_helper):
    lst = await create_list(name="Test", kind="user")
    t = await create_track("with audio")
    await attach_audio_helper(t.id, role="audio_tagged_mp3")
    await add_track_to_list(t.id, lst.id)
    rows = await tracks_in_list(lst.id)
    assert rows[0].has_audio is True


@pytest.mark.asyncio
async def test_tracks_in_list_has_audio_false_without_audio():
    lst = await create_list(name="Test2", kind="user")
    t = await create_track("no audio")
    await add_track_to_list(t.id, lst.id)
    rows = await tracks_in_list(lst.id)
    assert rows[0].has_audio is False


@pytest.mark.asyncio
async def test_tracks_in_list_filter_by_producer():
    lst = await create_list(name="Filtered", kind="user")
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    t3 = await create_track("T3")
    await update_track(t1.id, {"producer": ["Alice"]})
    await update_track(t2.id, {"producer": ["Bob"]})
    # t3 has no producer
    await add_track_to_list(t1.id, lst.id)
    await add_track_to_list(t2.id, lst.id)
    await add_track_to_list(t3.id, lst.id)

    rows = await tracks_in_list(lst.id, producers=["Alice"])
    assert len(rows) == 1
    assert rows[0].title == "T1"


@pytest.mark.asyncio
async def test_tracks_in_list_sort_by_title_asc():
    lst = await create_list(name="Sorted", kind="user")
    c = await create_track("C")
    a = await create_track("A")
    b = await create_track("B")
    await add_track_to_list(c.id, lst.id)
    await add_track_to_list(a.id, lst.id)
    await add_track_to_list(b.id, lst.id)

    rows = await tracks_in_list(lst.id, sort_by="title", sort_dir="asc")
    assert [r.title for r in rows] == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_tracks_in_list_default_position_order():
    """tracks_in_list() with no sort_by must return tracks in position ASC order."""
    import aiosqlite
    from beatos_core.db import resolve_db_path

    lst = await create_list(name="PositionTest", kind="user")
    first = await create_track("First")
    second = await create_track("Second")
    third = await create_track("Third")

    await add_track_to_list(first.id, lst.id)
    await add_track_to_list(second.id, lst.id)
    await add_track_to_list(third.id, lst.id)

    # Assign explicit positions so the expected order is unambiguous.
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
            (10, first.id, lst.id),
        )
        await conn.execute(
            "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
            (20, second.id, lst.id),
        )
        await conn.execute(
            "UPDATE track_list SET position = ? WHERE track_id = ? AND list_id = ?",
            (5, third.id, lst.id),
        )
        await conn.commit()

    rows = await tracks_in_list(lst.id)
    assert [r.title for r in rows] == ["Third", "First", "Second"]
