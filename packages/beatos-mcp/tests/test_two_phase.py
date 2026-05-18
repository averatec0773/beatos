"""two_phase: token create / verify / consume contract."""
from __future__ import annotations

import asyncio

import aiosqlite
import pytest

from beatos_mcp.two_phase import (
    TokenError,
    consume_token,
    create_token,
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

        # Status auto-updated.
        async with conn.execute("SELECT status FROM tokens WHERE token=?", (token,)) as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == "expired"


@pytest.mark.asyncio
async def test_unknown_token_raises(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        with pytest.raises(TokenError, match="not found"):
            await verify_token(conn, "nonexistent-token-abc", "import_track")
