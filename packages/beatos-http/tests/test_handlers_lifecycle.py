"""Approve handlers for lifecycle tools: trash/restore/purge."""
import datetime as dt
import json

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
        for i, title in enumerate(["A", "B", "C"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (i, title, now, now),
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
async def test_approve_trash_tracks_sets_deleted_at(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(conn, "trash_tracks", {"ids": [1, 2]})

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["trashed_count"] == 2
    assert sorted(body["ids"]) == [1, 2]

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id FROM track WHERE deleted_at IS NOT NULL ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    assert [r[0] for r in rows] == [1, 2]


@pytest.mark.asyncio
async def test_approve_restore_tracks_clears_deleted_at(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at=? WHERE id IN (1,2)", ("x",))
        tok = await create_token(conn, "restore_tracks", {"ids": [1, 2]})
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["restored_count"] == 2

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NOT NULL"
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 0


@pytest.mark.asyncio
async def test_approve_purge_tracks_deletes_row(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(conn, "purge_tracks", {"ids": [1, 2]})

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["purged_count"] == 2

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM track") as cur:
            row = await cur.fetchone()
    assert row[0] == 1  # only id=3 remains


@pytest.mark.asyncio
async def test_approve_trash_rolls_back_when_id_vanished(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(conn, "trash_tracks", {"ids": [1, 999]})

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 409  # RowVanishedError → 409

    # Nothing was trashed (rollback)
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NOT NULL"
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 0
