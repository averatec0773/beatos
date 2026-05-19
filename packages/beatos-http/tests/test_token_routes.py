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
