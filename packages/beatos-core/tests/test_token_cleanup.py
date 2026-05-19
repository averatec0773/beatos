"""Cleanup task: pending→expired transition + delete old terminal rows."""
import asyncio
import time

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.two_phase import (
    cleanup_terminal_tokens,
    consume_token_with_result,
    create_token,
    reject_token,
)


@pytest.fixture
async def db_path(tmp_path):
    """Fresh DB with all migrations applied."""
    path = tmp_path / "test.db"
    await run_migrations(path)
    return path


@pytest.mark.asyncio
async def test_cleanup_empty_table_returns_zero(db_path):
    async with aiosqlite.connect(db_path) as conn:
        assert await cleanup_terminal_tokens(conn) == 0


@pytest.mark.asyncio
async def test_cleanup_keeps_pending_rows(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await create_token(conn, "create_list", {"name": "X"}, ttl_sec=300)
        deleted = await cleanup_terminal_tokens(conn)
        assert deleted == 0
        async with conn.execute("SELECT COUNT(*) FROM tokens") as cur:
            row = await cur.fetchone()
        assert row[0] == 1


@pytest.mark.asyncio
async def test_cleanup_keeps_recent_consumed_rows(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await consume_token_with_result(conn, token, {"list_id": 1})
        # Backdate consumed_at to 6 days ago (< 7-day threshold)
        await conn.execute(
            "UPDATE tokens SET consumed_at=? WHERE token=?",
            (time.time() - 6 * 86400, token),
        )
        await conn.commit()
        deleted = await cleanup_terminal_tokens(conn)
        assert deleted == 0


@pytest.mark.asyncio
async def test_cleanup_deletes_old_consumed_rows(db_path):
    async with aiosqlite.connect(db_path) as conn:
        token = await create_token(conn, "create_list", {"name": "X"})
        await consume_token_with_result(conn, token, {"list_id": 1})
        # Backdate consumed_at to 8 days ago (> 7-day threshold)
        await conn.execute(
            "UPDATE tokens SET consumed_at=? WHERE token=?",
            (time.time() - 8 * 86400, token),
        )
        await conn.commit()
        deleted = await cleanup_terminal_tokens(conn)
        assert deleted == 1
        async with conn.execute("SELECT COUNT(*) FROM tokens") as cur:
            row = await cur.fetchone()
        assert row[0] == 0


@pytest.mark.asyncio
async def test_cleanup_transitions_pending_to_expired(db_path):
    async with aiosqlite.connect(db_path) as conn:
        # Token with already-past expires_at
        await create_token(conn, "create_list", {"name": "X"}, ttl_sec=1)
        await asyncio.sleep(1.1)
        # Cleanup with a max_age that won't delete it yet: pass huge max_age
        await cleanup_terminal_tokens(conn, max_age_days=365)
        async with conn.execute("SELECT status FROM tokens") as cur:
            row = await cur.fetchone()
        assert row[0] == "expired"


@pytest.mark.asyncio
async def test_cleanup_deletes_old_expired_via_coalesce(db_path):
    """Expired rows (consumed_at IS NULL) get cleaned via COALESCE(consumed_at, expires_at)."""
    async with aiosqlite.connect(db_path) as conn:
        # Manually insert an expired token with NULL consumed_at and old expires_at
        await conn.execute(
            "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at, status) "
            "VALUES (?, ?, ?, ?, ?, 'expired')",
            ("old-expired", "create_list", "{}", 0, time.time() - 8 * 86400),
        )
        await conn.commit()
        deleted = await cleanup_terminal_tokens(conn)
        assert deleted == 1
