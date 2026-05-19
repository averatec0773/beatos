"""Approve handlers for list curation."""
import datetime as dt

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


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


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.mark.asyncio
async def test_approve_update_list(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "update_list", {"list_id": 10, "name": "Renamed"}
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    assert res.json() == {"list_id": 10, "name": "Renamed"}
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT name FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == "Renamed"


@pytest.mark.asyncio
async def test_approve_delete_list_cascades(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(conn, "delete_list", {"list_id": 10, "name": "Demo"})
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == 0
        async with conn.execute("SELECT COUNT(*) FROM track_list WHERE list_id=10") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_approve_add_tracks_to_list_positions_sequential(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "add_tracks_to_list", {"list_id": 10, "track_ids": [4, 5]}
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["added_count"] == 2
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, position FROM track_list WHERE list_id=10 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    # 1@0, 2@1, 3@2, 4@3, 5@4
    assert rows == [(1, 0), (2, 1), (3, 2), (4, 3), (5, 4)]


@pytest.mark.asyncio
async def test_approve_remove_tracks_from_list(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "remove_tracks_from_list", {"list_id": 10, "track_ids": [2]}
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id FROM track_list WHERE list_id=10 ORDER BY track_id"
        ) as cur:
            rows = await cur.fetchall()
    assert [r[0] for r in rows] == [1, 3]


@pytest.mark.asyncio
async def test_approve_reorder_list_updates_positions(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "reorder_list", {"list_id": 10, "track_ids": [3, 1, 2]}
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, position FROM track_list WHERE list_id=10 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(3, 0), (1, 1), (2, 2)]


@pytest.mark.asyncio
async def test_approve_add_tracks_to_list_409_when_track_vanished_mid_ttl(client, db_path):
    """Track is deleted from track table between token-create and approve;
    handler must surface this as 409 RowVanished, not 500."""
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn, "add_tracks_to_list", {"list_id": 10, "track_ids": [4, 5]}
        )
        # Delete track 4 from the track table (simulating mid-TTL vanish)
        await conn.execute("DELETE FROM track WHERE id=4")
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 409
    # No rows were added (rollback)
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track_list WHERE list_id=10 AND track_id IN (4,5)"
        ) as cur:
            assert (await cur.fetchone())[0] == 0
