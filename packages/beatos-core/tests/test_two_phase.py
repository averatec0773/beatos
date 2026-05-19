"""two_phase: token create / verify / consume contract."""
from __future__ import annotations

import asyncio
import json
import time

import aiosqlite
import pytest

from beatos_core.two_phase import (
    TokenError,
    consume_token,
    consume_token_with_result,
    create_token,
    get_token_status,
    reject_token,
    verify_token,
)


@pytest.mark.asyncio
async def test_create_then_verify_returns_payload(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "import_track", {"path": "/x/y.wav"})
        payload = await verify_token(conn, token, "import_track")
    assert payload == {"path": "/x/y.wav"}


@pytest.mark.asyncio
async def test_consume_then_reverify_raises(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "import_track", {"path": "/x/y.wav"})
        await verify_token(conn, token, "import_track")
        await consume_token(conn, token)
        with pytest.raises(TokenError, match="already consumed"):
            await verify_token(conn, token, "import_track")


@pytest.mark.asyncio
async def test_verify_wrong_tool_raises(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "import_track", {"path": "/x"})
        with pytest.raises(TokenError, match="tool mismatch"):
            await verify_token(conn, token, "publish_track")


@pytest.mark.asyncio
async def test_expired_token_raises_and_updates_status(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        # ttl_sec=0 means expires_at == created_at — already expired.
        token = await create_token(conn, "import_track", {"a": 1}, ttl_sec=0)
        # Sleep a tick so monotonic clock advances past created_at.
        await asyncio.sleep(0.01)
        with pytest.raises(TokenError, match="expired"):
            await verify_token(conn, token, "import_track")

        # Status remains pending; cleanup_terminal_tokens owns the pending → expired transition.
        async with conn.execute("SELECT status FROM tokens WHERE token=?", (token,)) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "pending"


@pytest.mark.asyncio
async def test_unknown_token_raises(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        with pytest.raises(TokenError, match="not found"):
            await verify_token(conn, "nonexistent-token-abc", "import_track")


@pytest.mark.asyncio
async def test_verify_token_does_not_commit_inside_outer_transaction(fresh_db):
    """Regression: verify_token used to commit on lazy-expire, breaking
    outer transactions. The expired branch must now raise without touching
    conn state."""
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "demo", {"k": "v"}, ttl_sec=1)
        # Sleep past TTL so verify will see "expired"
        await asyncio.sleep(1.1)

        await conn.execute("BEGIN")
        # Make an uncommitted write the test will later check rolled back
        await conn.execute(
            "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at, status) "
            "VALUES ('sentinel', 'demo', '{}', 0, 0, 'pending')"
        )

        with pytest.raises(TokenError, match="expired"):
            await verify_token(conn, token, expected_tool="demo")

        # Rollback the outer transaction — the sentinel row must vanish
        await conn.execute("ROLLBACK")

        async with conn.execute(
            "SELECT 1 FROM tokens WHERE token='sentinel'"
        ) as cur:
            row = await cur.fetchone()
        assert row is None, "verify_token must not commit on lazy-expire"


@pytest.mark.asyncio
async def test_consume_token_with_result_stores_result_json(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})
        await consume_token_with_result(conn, token, {"list_id": 7})

        async with conn.execute(
            "SELECT status, result FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        status, result_json = row
        assert status == "consumed"
        assert json.loads(result_json) == {"list_id": 7}


@pytest.mark.asyncio
async def test_consume_token_with_result_raises_when_already_consumed(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "Trap"})
        await consume_token_with_result(conn, token, {"list_id": 7})
        with pytest.raises(TokenError, match="not in pending state"):
            await consume_token_with_result(conn, token, {"list_id": 999})


@pytest.mark.asyncio
async def test_reject_token_marks_rejected(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await reject_token(conn, token)
        async with conn.execute(
            "SELECT status, consumed_at FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        status, consumed_at = row
        assert status == "rejected"
        assert consumed_at is not None


@pytest.mark.asyncio
async def test_reject_token_no_op_on_terminal_token(fresh_db):
    """Approve/Reject race: one wins, the other must not raise."""
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await consume_token_with_result(conn, token, {"list_id": 1})
        # Should silently no-op, not raise
        await reject_token(conn, token)
        # Status remains consumed
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
        assert row[0] == "consumed"


@pytest.mark.asyncio
async def test_get_token_status_pending(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        info = await get_token_status(conn, token)
        assert info["tool_name"] == "create_list"
        assert info["status"] == "pending"
        assert info["payload"] == {"name": "X"}
        assert info["result"] is None
        assert info["expires_at"] > time.time()


@pytest.mark.asyncio
async def test_get_token_status_consumed_returns_result(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        token = await create_token(conn, "create_list", {"name": "Y"})
        await consume_token_with_result(conn, token, {"list_id": 42})
        info = await get_token_status(conn, token)
        assert info["status"] == "consumed"
        assert info["result"] == {"list_id": 42}


@pytest.mark.asyncio
async def test_get_token_status_raises_when_not_found(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        with pytest.raises(TokenError, match="not found"):
            await get_token_status(conn, "bogus")
