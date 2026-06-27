"""Shared write chokepoint (moved into core)."""
import pathlib

import aiosqlite
import pytest
import pytest_asyncio

from beatos_core.db import connect_writable, run_migrations


@pytest_asyncio.fixture
async def fresh_db(tmp_path: pathlib.Path, monkeypatch):
    db = tmp_path / "beatos.db"
    await run_migrations(db)
    monkeypatch.setenv("BEATOS_DB_PATH", str(db))
    yield db


@pytest.mark.asyncio
async def test_connect_writable_enables_foreign_keys(fresh_db):
    async with connect_writable() as conn:
        async with conn.execute("PRAGMA foreign_keys") as cur:
            (fk,) = await cur.fetchone()
    assert fk == 1
