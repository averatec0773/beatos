"""create_list MCP tool — issues 2PC token, does NOT write list table."""
import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_mcp.tools.create_list import create_list


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    await run_migrations(path)
    monkeypatch.setenv("BEATOS_DB_PATH", str(path))
    return path


@pytest.mark.asyncio
async def test_create_list_issues_token_and_does_not_write_list(db_path):
    result = await create_list(name="Trap 2026")
    assert "token" in result
    assert "expires_at" in result
    assert "message" in result
    assert "Awaiting" in result["message"]

    async with aiosqlite.connect(db_path) as conn:
        # tokens row exists
        async with conn.execute(
            "SELECT tool_name, payload, status FROM tokens WHERE token=?",
            (result["token"],),
        ) as cur:
            row = await cur.fetchone()
        assert row[0] == "create_list"
        assert '"Trap 2026"' in row[1]
        assert row[2] == "pending"
        # list table is untouched
        async with conn.execute("SELECT COUNT(*) FROM list WHERE name='Trap 2026'") as cur:
            count = await cur.fetchone()
        assert count[0] == 0


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
