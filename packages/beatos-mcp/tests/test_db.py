"""Connection helper enforces BEATOS_DB_PATH + query_only."""
from __future__ import annotations

import pytest

from beatos_mcp.db import DBNotConfigured, connect


@pytest.mark.asyncio
async def test_connect_uses_env_path(fresh_db):
    async with connect() as conn:
        async with conn.execute("PRAGMA query_only") as cur:
            row = await cur.fetchone()
    assert row is not None and row[0] == 1


@pytest.mark.asyncio
async def test_connect_raises_when_env_missing(monkeypatch):
    monkeypatch.delenv("BEATOS_DB_PATH", raising=False)
    with pytest.raises(DBNotConfigured, match="BEATOS_DB_PATH"):
        async with connect():
            pass


@pytest.mark.asyncio
async def test_connect_raises_when_file_missing(tmp_path, monkeypatch):
    bad = tmp_path / "does-not-exist.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(bad))
    with pytest.raises(DBNotConfigured, match="Database not found"):
        async with connect():
            pass


@pytest.mark.asyncio
async def test_connect_rejects_writes(fresh_db):
    async with connect() as conn:
        with pytest.raises(Exception):
            await conn.execute(
                "INSERT INTO tokens (token, tool_name, payload, created_at, expires_at) "
                "VALUES ('x', 'y', '{}', 0, 0)"
            )
