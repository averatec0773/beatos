"""Direct-apply handlers for lifecycle tools: trash/restore/purge."""
import datetime as dt

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.approvals import RowVanishedError, apply
from beatos_core.db import run_migrations


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        for i, title in enumerate(["A", "B", "C"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (i, title, now, now),
            )
        await conn.commit()
    return p


@pytest.mark.asyncio
async def test_apply_trash_tracks_sets_deleted_at(db_path):
    async with aiosqlite.connect(db_path) as conn:
        result = await apply(conn, "trash_tracks", {"ids": [1, 2]})
        await conn.commit()
    assert result["trashed_count"] == 2
    assert sorted(result["ids"]) == [1, 2]

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id FROM track WHERE deleted_at IS NOT NULL ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    assert [r[0] for r in rows] == [1, 2]


@pytest.mark.asyncio
async def test_apply_restore_tracks_clears_deleted_at(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at=? WHERE id IN (1,2)", ("x",))
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        result = await apply(conn, "restore_tracks", {"ids": [1, 2]})
        await conn.commit()
    assert result["restored_count"] == 2

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NOT NULL"
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 0


@pytest.mark.asyncio
async def test_apply_purge_tracks_deletes_row(db_path):
    async with aiosqlite.connect(db_path) as conn:
        result = await apply(conn, "purge_tracks", {"ids": [1, 2]})
        await conn.commit()
    assert result["purged_count"] == 2

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM track") as cur:
            row = await cur.fetchone()
    assert row[0] == 1  # only id=3 remains


@pytest.mark.asyncio
async def test_apply_trash_rolls_back_when_id_vanished(db_path):
    async with aiosqlite.connect(db_path) as conn:
        with pytest.raises(RowVanishedError):
            await apply(conn, "trash_tracks", {"ids": [1, 999]})
        # Caller rolls back on the raised error.
        await conn.rollback()

    # Nothing was trashed (rollback)
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NOT NULL"
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 0


@pytest.mark.asyncio
async def test_purge_tracks_cascades_asset_and_track_list(db_path):
    """Regression: ON DELETE CASCADE on asset.track_id and track_list.track_id
    requires PRAGMA foreign_keys=ON per connection. Without it, purging a track
    leaves orphan rows in asset and track_list."""
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        # Create a list and add track 1 to it
        cur = await conn.execute(
            "INSERT INTO list (name, kind, position, created_at) VALUES ('L', 'user', 0, ?)",
            (now,),
        )
        list_id = cur.lastrowid
        await conn.execute(
            "INSERT INTO track_list (list_id, track_id, position, added_at) VALUES (?, 1, 0, ?)",
            (list_id, now),
        )
        # Attach an asset to track 1
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/tmp/x.wav', ?, ?)",
            (now, now),
        )
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        result = await apply(conn, "purge_tracks", {"ids": [1]})
        await conn.commit()
    assert result["purged_count"] == 1

    async with aiosqlite.connect(db_path) as conn:
        # track row must be gone
        async with conn.execute("SELECT COUNT(*) FROM track WHERE id=1") as cur:
            assert (await cur.fetchone())[0] == 0, "track row not deleted"
        # asset row must be cascaded away
        async with conn.execute("SELECT COUNT(*) FROM asset WHERE track_id=1") as cur:
            assert (await cur.fetchone())[0] == 0, "orphan asset row remained (foreign_keys=OFF?)"
        # track_list membership must be cascaded away
        async with conn.execute(
            "SELECT COUNT(*) FROM track_list WHERE track_id=1"
        ) as cur:
            assert (await cur.fetchone())[0] == 0, "orphan track_list row remained (foreign_keys=OFF?)"
