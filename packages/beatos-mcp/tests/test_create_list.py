"""create_list MCP tool — applies directly (L1) and writes the list table."""
import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.db import run_migrations
from beatos_mcp.tools.create_list import create_list


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.mark.asyncio
async def test_create_list_applies_and_writes_list(db_path):
    result = await create_list(name="Trap 2026")
    assert result["status"] == "applied"
    assert result["result"]["name"] == "Trap 2026"
    assert isinstance(result["result"]["list_id"], int)

    async with aiosqlite.connect(db_path) as conn:
        # The list row was written directly (no 2PC token gate anymore).
        async with conn.execute(
            "SELECT name, kind FROM list WHERE id=?", (result["result"]["list_id"],)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] == "Trap 2026"
    assert row[1] == "user"


@pytest.mark.asyncio
async def test_create_list_rejects_empty_name(db_path):
    with pytest.raises(ValueError, match="name"):
        await create_list(name="")


@pytest.mark.asyncio
async def test_create_list_rejects_too_long_name(db_path):
    with pytest.raises(ValueError, match="name"):
        await create_list(name="x" * 201)


@pytest.mark.asyncio
async def test_create_list_rejects_non_string_name(db_path):
    with pytest.raises(ValueError, match="name"):
        await create_list(name=123)  # type: ignore[arg-type]
