"""HTTP approve handler tests for draft_descriptions."""
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
        for i, title in enumerate(["A", "B"], start=1):
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
async def test_approve_sets_draft_only(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET description='LIVE' WHERE id=1")
        await conn.commit()
        tok = await create_token(
            conn,
            "draft_descriptions",
            {
                "items": [
                    {"track_id": 1, "text": "draft 1"},
                    {"track_id": 2, "text": "draft 2"},
                ],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["set_count"] == 2
    assert set(body["ids"]) == {1, 2}
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id, description, description_draft FROM track ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    # description untouched; description_draft set
    assert rows[0] == (1, "LIVE", "draft 1")
    assert rows[1] == (2, None, "draft 2")


@pytest.mark.asyncio
async def test_approve_row_vanished_returns_409(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "draft_descriptions",
            {
                "items": [{"track_id": 999, "text": "ghost"}],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_approve_idempotent_token_consumed(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "draft_descriptions",
            {
                "items": [{"track_id": 1, "text": "once"}],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    res1 = await client.post(f"/api/tokens/{tok}/approve")
    assert res1.status_code == 200
    # Second approval of the same token should fail (consumed)
    res2 = await client.post(f"/api/tokens/{tok}/approve")
    assert res2.status_code in (404, 409, 422)
