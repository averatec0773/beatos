"""WAL mode is enabled by run_migrations and persists across connections."""
import pathlib
import aiosqlite
import pytest

from beatos_core.db import run_migrations


@pytest.mark.asyncio
async def test_wal_mode_enabled_after_migrations(tmp_path: pathlib.Path):
    db = tmp_path / "test.db"
    await run_migrations(db)

    # Re-open: WAL is a persistent file-level setting, not per-connection.
    async with aiosqlite.connect(db) as conn:
        async with conn.execute("PRAGMA journal_mode") as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row[0].lower() == "wal"
