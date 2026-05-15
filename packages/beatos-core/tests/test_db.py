"""Tests for the migration runner."""
import pathlib

import aiosqlite
import pytest

from beatos_core.db import run_migrations


async def _table_names(db_path: pathlib.Path) -> list[str]:
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ) as cur:
            rows = await cur.fetchall()
    return [r[0] for r in rows]


@pytest.mark.asyncio
async def test_run_migrations_creates_all_tables(tmp_path):
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    names = await _table_names(db_path)
    assert names == [
        "asset",
        "library",
        "list",
        "schema_version",
        "settings",
        "track",
        "track_list",
        "watch_folder",
    ]


@pytest.mark.asyncio
async def test_run_migrations_is_idempotent(tmp_path):
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)
    await run_migrations(db_path)  # second call must not re-apply

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM schema_version"
        ) as cur:
            (count,) = await cur.fetchone()

    assert count == 2


@pytest.mark.asyncio
async def test_run_migrations_records_applied_version(tmp_path):
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT version FROM schema_version ORDER BY version"
        ) as cur:
            rows = await cur.fetchall()

    assert [r[0] for r in rows] == [1, 2]
