"""Tests for soft-delete / trash / restore / purge (migration 008)."""
import pytest

from beatos_core.db import run_migrations
from beatos_core.tracks.service import (
    create_track,
    get_track,
    list_tracks,
    list_trash,
    trash_track,
    restore_track,
    purge_track,
    purge_all_trash,
    list_distinct_values,
)
from beatos_core.lists.membership import tracks_in_list


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


@pytest.mark.asyncio
async def test_migration_008_idempotent(tmp_path, monkeypatch):
    """Applying migrations twice does not error."""
    import pathlib
    import aiosqlite

    db_path = tmp_path / "idem.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("PRAGMA table_info(track)") as cur:
            cols = [r[1] for r in await cur.fetchall()]
    assert "deleted_at" in cols


@pytest.mark.asyncio
async def test_trash_track_sets_deleted_at():
    track = await create_track("Beat A")
    assert track.deleted_at is None

    trashed = await trash_track(track.id)
    assert trashed.deleted_at is not None
    assert trashed.id == track.id


@pytest.mark.asyncio
async def test_get_track_still_returns_trashed():
    track = await create_track("Beat B")
    await trash_track(track.id)

    fetched = await get_track(track.id)
    assert fetched is not None
    assert fetched.deleted_at is not None


@pytest.mark.asyncio
async def test_restore_track_clears_deleted_at():
    track = await create_track("Beat C")
    await trash_track(track.id)

    restored = await restore_track(track.id)
    assert restored.deleted_at is None

    fetched = await get_track(track.id)
    assert fetched.deleted_at is None


@pytest.mark.asyncio
async def test_purge_track_removes_row():
    track = await create_track("Beat D")
    await trash_track(track.id)
    await purge_track(track.id)

    fetched = await get_track(track.id)
    assert fetched is None


@pytest.mark.asyncio
async def test_list_tracks_excludes_trashed():
    t1 = await create_track("Visible")
    t2 = await create_track("Hidden")
    await trash_track(t2.id)

    tracks = await list_tracks()
    ids = [t.id for t in tracks]
    assert t1.id in ids
    assert t2.id not in ids


@pytest.mark.asyncio
async def test_list_trash_returns_only_trashed():
    t1 = await create_track("Active")
    t2 = await create_track("Trashed")
    await trash_track(t2.id)

    trashed = await list_trash()
    ids = [t.id for t in trashed]
    assert t2.id in ids
    assert t1.id not in ids


@pytest.mark.asyncio
async def test_list_trash_ordered_by_deleted_at_desc():
    t1 = await create_track("First")
    t2 = await create_track("Second")
    await trash_track(t1.id)
    await trash_track(t2.id)

    trashed = await list_trash()
    assert len(trashed) == 2
    # most-recently trashed first
    assert trashed[0].id == t2.id
    assert trashed[1].id == t1.id


@pytest.mark.asyncio
async def test_tracks_in_list_excludes_trashed():
    from beatos_core.lists.service import create_list
    from beatos_core.lists.membership import add_track_to_list

    t1 = await create_track("InList Active")
    t2 = await create_track("InList Trashed")
    lst = await create_list(name="TestList", kind="user")

    await add_track_to_list(t1.id, lst.id)
    await add_track_to_list(t2.id, lst.id)
    await trash_track(t2.id)

    members = await tracks_in_list(lst.id)
    ids = [t.id for t in members]
    assert t1.id in ids
    assert t2.id not in ids


@pytest.mark.asyncio
async def test_list_distinct_values_excludes_trashed():
    t1 = await create_track("Prod A")
    t2 = await create_track("Prod B")

    from beatos_core.tracks.service import update_track
    await update_track(t1.id, {"producer": ["Alice"]})
    await update_track(t2.id, {"producer": ["Bob"]})

    await trash_track(t2.id)

    producers = await list_distinct_values("producer")
    assert "Alice" in producers
    assert "Bob" not in producers


@pytest.mark.asyncio
async def test_purge_all_trash_deletes_only_trashed():
    active = await create_track("Active")
    t1 = await create_track("Trashed 1")
    t2 = await create_track("Trashed 2")
    await trash_track(t1.id)
    await trash_track(t2.id)

    n = await purge_all_trash()
    assert n == 2

    # active row survives, trashed rows hard-deleted
    assert await get_track(active.id) is not None
    assert await get_track(t1.id) is None
    assert await get_track(t2.id) is None
    assert await list_trash() == []


@pytest.mark.asyncio
async def test_purge_all_trash_returns_zero_when_empty():
    await create_track("Active only")
    assert await purge_all_trash() == 0
