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
async def test_run_migrations_is_idempotent(tmp_path):
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)
    await run_migrations(db_path)  # second call must not re-apply

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM schema_version"
        ) as cur:
            (count,) = await cur.fetchone()

    assert count == 10


@pytest.mark.asyncio
async def test_run_migrations_records_applied_version(tmp_path):
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT version FROM schema_version ORDER BY version"
        ) as cur:
            rows = await cur.fetchall()

    assert [r[0] for r in rows] == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]


@pytest.mark.asyncio
async def test_schema_v004_tables_present(tmp_path: pathlib.Path) -> None:
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    names = await _table_names(db_path)
    assert "source" in names
    assert "track" in names
    assert "asset" in names
    assert "list" in names
    assert "track_list" in names
    assert "schema_version" in names
    assert "library" not in names
    assert "watch_folder" not in names


@pytest.mark.asyncio
async def test_track_has_no_library_id(tmp_path: pathlib.Path) -> None:
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("PRAGMA table_info(track)") as cur:
            cols = [r[1] for r in await cur.fetchall()]
    assert "library_id" not in cols
    assert "title" in cols
    assert "description_draft" in cols


@pytest.mark.asyncio
async def test_list_has_no_source_fk(tmp_path: pathlib.Path) -> None:
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("PRAGMA table_info(list)") as cur:
            cols = [r[1] for r in await cur.fetchall()]
    assert "source_id" not in cols
    assert "library_id" not in cols
    assert "kind" in cols
    assert "name" in cols


@pytest.mark.asyncio
async def test_track_list_join_table(tmp_path: pathlib.Path) -> None:
    db_path = tmp_path / "test.sqlite"

    await run_migrations(db_path)

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("PRAGMA table_info(track_list)") as cur:
            cols = {r[1] for r in await cur.fetchall()}
    assert {"list_id", "track_id", "position", "added_at"} <= cols
