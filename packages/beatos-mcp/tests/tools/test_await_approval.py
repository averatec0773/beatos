"""await_approval normalizes status for any 2PC token, tool-agnostic."""
import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token, consume_token_with_result, reject_token
from beatos_mcp.tools.await_approval import await_approval


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


@pytest.mark.asyncio
async def test_not_found_returns_not_found_status(db_path):
    r = await await_approval(token="bogus")
    assert r == {"status": "not_found", "token": "bogus"}


@pytest.mark.asyncio
async def test_pending_token_returns_awaiting_approval(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    r = await await_approval(token=token)
    assert r["status"] == "awaiting_approval"
    assert r["tool_name"] == "create_list"
    assert "expires_at" in r


@pytest.mark.asyncio
async def test_consumed_token_returns_approved_with_result(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await consume_token_with_result(conn, token, {"list_id": 42})
        await conn.commit()
    r = await await_approval(token=token)
    assert r["status"] == "approved"
    assert r["result"] == {"list_id": 42}


@pytest.mark.asyncio
async def test_rejected_token_returns_rejected(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await reject_token(conn, token)
        await conn.commit()
    r = await await_approval(token=token)
    assert r["status"] == "rejected"


@pytest.mark.asyncio
async def test_empty_token_raises(db_path):
    with pytest.raises(ValueError):
        await await_approval(token="")
