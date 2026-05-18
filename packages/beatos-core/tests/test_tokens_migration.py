"""009_tokens migration creates the tokens table + expected columns + index."""
import pathlib
import aiosqlite
import pytest

from beatos_core.db import run_migrations


@pytest.mark.asyncio
async def test_tokens_table_columns(tmp_path: pathlib.Path):
    db = tmp_path / "test.db"
    await run_migrations(db)

    async with aiosqlite.connect(db) as conn:
        async with conn.execute("PRAGMA table_info(tokens)") as cur:
            rows = await cur.fetchall()
    cols = {row[1]: row[2] for row in rows}
    assert cols == {
        "token": "TEXT",
        "tool_name": "TEXT",
        "payload": "TEXT",
        "created_at": "REAL",
        "expires_at": "REAL",
        "status": "TEXT",
        "consumed_at": "REAL",
    }


@pytest.mark.asyncio
async def test_tokens_pending_index(tmp_path: pathlib.Path):
    db = tmp_path / "test.db"
    await run_migrations(db)

    async with aiosqlite.connect(db) as conn:
        async with conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tokens'"
        ) as cur:
            indexes = {row[0] for row in await cur.fetchall()}
    assert "idx_tokens_expires" in indexes
