"""confirm_create_list MCP tool — read-only token status check."""
import time

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.two_phase import (
    consume_token_with_result,
    create_token,
    reject_token,
)
from beatos_mcp.tools.confirm_create_list import confirm_create_list


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.mark.asyncio
async def test_confirm_pending_returns_awaiting_approval(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
    result = await confirm_create_list(token=token)
    assert result["status"] == "awaiting_approval"
    assert result["expires_at"] > time.time()


@pytest.mark.asyncio
async def test_confirm_consumed_returns_approved_with_list_id(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})
        await consume_token_with_result(conn, token, {"list_id": 42})
        await conn.commit()
    result = await confirm_create_list(token=token)
    assert result == {"status": "approved", "list_id": 42, "name": "Trap"}


@pytest.mark.asyncio
async def test_confirm_rejected_returns_rejected(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await reject_token(conn, token)
    result = await confirm_create_list(token=token)
    assert result == {"status": "rejected"}


@pytest.mark.asyncio
async def test_confirm_expired_returns_expired(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        # Force expired status
        await conn.execute(
            "UPDATE tokens SET status='expired' WHERE token=?", (token,)
        )
        await conn.commit()
    result = await confirm_create_list(token=token)
    assert result == {"status": "expired"}


@pytest.mark.asyncio
async def test_confirm_unknown_token_raises(db_path):
    with pytest.raises(ValueError, match="not found"):
        await confirm_create_list(token="bogus")


@pytest.mark.asyncio
async def test_confirm_wrong_tool_raises(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "other_tool", {})
    with pytest.raises(ValueError, match="not a create_list token"):
        await confirm_create_list(token=token)
