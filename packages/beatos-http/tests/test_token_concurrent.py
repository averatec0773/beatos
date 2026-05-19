"""Concurrent approve/approve and approve/reject races.

SQLite WAL + single-statement UPDATE WHERE status='pending' is our locking
primitive; tests verify the loser doesn't double-write / double-create."""
import asyncio
import json

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.mark.asyncio
async def test_two_parallel_approves_one_succeeds_one_409(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})

    res1, res2 = await asyncio.gather(
        client.post(f"/api/tokens/{token}/approve"),
        client.post(f"/api/tokens/{token}/approve"),
    )
    statuses = sorted([res1.status_code, res2.status_code])
    assert statuses == [200, 409]

    # Exactly one list row exists with that name
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM list WHERE name='Trap'"
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == 1


@pytest.mark.asyncio
async def test_approve_and_reject_one_wins(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Maybe"})

    res_a, res_r = await asyncio.gather(
        client.post(f"/api/tokens/{token}/approve"),
        client.post(f"/api/tokens/{token}/reject"),
    )
    # Approve either wins (200 + status=consumed) or loses (409 + status=rejected).
    # Reject always returns 200 (race-tolerant no-op).
    assert res_r.status_code == 200
    assert res_a.status_code in (200, 409)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] in ("consumed", "rejected")

    # If approve won, exactly 1 list row; if reject won, 0 list rows.
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM list WHERE name='Maybe'"
        ) as cur:
            row = await cur.fetchone()
    if res_a.status_code == 200:
        assert row[0] == 1
    else:
        assert row[0] == 0
