"""HTTP routes for the 2PC token surface."""
import json
import time

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
async def test_list_pending_tokens_empty(client):
    res = await client.get("/api/tokens?status=pending")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_pending_tokens_returns_open_rows(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        await create_token(conn, "create_list", {"name": "Trap 2026"})
    res = await client.get("/api/tokens?status=pending")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    row = body[0]
    assert row["tool_name"] == "create_list"
    assert row["payload"] == {"name": "Trap 2026"}
    assert "token" in row
    assert "expires_at" in row
    assert "created_at" in row


@pytest.mark.asyncio
async def test_approve_create_list_happy_path(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap 2026"})

    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Trap 2026"
    assert isinstance(body["list_id"], int)

    # The list table now has a row
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name, kind FROM list WHERE id=?", (body["list_id"],)
        ) as cur:
            row = await cur.fetchone()
    assert row == ("Trap 2026", "user")

    # The token is consumed with result populated
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status, result FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    status, result_json = row
    assert status == "consumed"
    assert json.loads(result_json) == {"list_id": body["list_id"]}


@pytest.mark.asyncio
async def test_approve_token_not_found_returns_404(client):
    res = await client.post("/api/tokens/bogus/approve")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_approve_already_consumed_returns_409(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})
    await client.post(f"/api/tokens/{token}/approve")
    # Second approve must 409
    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_approve_unknown_tool_returns_400(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "nonexistent_tool", {})
    res = await client.post(f"/api/tokens/{token}/approve")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_reject_pending_marks_rejected(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    res = await client.post(f"/api/tokens/{token}/reject")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == "rejected"


@pytest.mark.asyncio
async def test_reject_already_consumed_is_no_op_200(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    await client.post(f"/api/tokens/{token}/approve")
    # Reject must NOT fail — Approve/Reject race tolerance
    res = await client.post(f"/api/tokens/{token}/reject")
    assert res.status_code == 200
    # Status stays consumed
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == "consumed"


@pytest.mark.asyncio
async def test_reject_token_not_found_returns_404(client):
    res = await client.post("/api/tokens/bogus/reject")
    assert res.status_code == 404
