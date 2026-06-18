"""Direct-apply handlers for list curation."""
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
        for i, title in enumerate(["A", "B", "C", "D", "E"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?,?,?,?)",
                (i, title, now, now),
            )
        await conn.execute(
            "INSERT INTO list (id, name, kind, position, created_at) VALUES (10, 'Demo', 'user', 0, ?)",
            (now,),
        )
        for pos, tid in enumerate([1, 2, 3]):
            await conn.execute(
                "INSERT INTO track_list (list_id, track_id, position, added_at) VALUES (10, ?, ?, ?)",
                (tid, pos, now),
            )
        await conn.commit()
    return p


@pytest.mark.asyncio
async def test_apply_update_list(db_path):
    async with aiosqlite.connect(db_path) as conn:
        result = await apply(conn, "update_list", {"list_id": 10, "name": "Renamed"})
        await conn.commit()
    assert result == {"list_id": 10, "name": "Renamed"}
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT name FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == "Renamed"


@pytest.mark.asyncio
async def test_apply_delete_list_cascades(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        await apply(conn, "delete_list", {"list_id": 10, "name": "Demo"})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == 0
        async with conn.execute("SELECT COUNT(*) FROM track_list WHERE list_id=10") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_apply_add_tracks_to_list_positions_sequential(db_path):
    async with aiosqlite.connect(db_path) as conn:
        result = await apply(
            conn, "add_tracks_to_list", {"list_id": 10, "track_ids": [4, 5]}
        )
        await conn.commit()
    assert result["added_count"] == 2
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, position FROM track_list WHERE list_id=10 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    # 1@0, 2@1, 3@2, 4@3, 5@4
    assert rows == [(1, 0), (2, 1), (3, 2), (4, 3), (5, 4)]


@pytest.mark.asyncio
async def test_apply_remove_tracks_from_list(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "remove_tracks_from_list", {"list_id": 10, "track_ids": [2]})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id FROM track_list WHERE list_id=10 ORDER BY track_id"
        ) as cur:
            rows = await cur.fetchall()
    assert [r[0] for r in rows] == [1, 3]


@pytest.mark.asyncio
async def test_apply_reorder_list_updates_positions(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "reorder_list", {"list_id": 10, "track_ids": [3, 1, 2]})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, position FROM track_list WHERE list_id=10 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(3, 0), (1, 1), (2, 2)]


@pytest.mark.asyncio
async def test_apply_add_tracks_to_list_raises_when_track_vanished(db_path):
    """Track is deleted from track table before apply; handler must surface this
    as RowVanishedError (the chokepoint rolls back), not a silent partial write."""
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM track WHERE id=4")
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(RowVanishedError):
            await apply(
                conn, "add_tracks_to_list", {"list_id": 10, "track_ids": [4, 5]}
            )
        await conn.rollback()
    # No rows were added (rollback)
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track_list WHERE list_id=10 AND track_id IN (4,5)"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
