"""list_lists: full list of user + system lists."""
from __future__ import annotations

import aiosqlite
import pytest

from beatos_mcp.tools.lists import list_lists


@pytest.mark.asyncio
async def test_list_lists_includes_seeded_system_list(fresh_db):
    # Migration 004 seeds the system "All Beats" list.
    result = await list_lists()
    items = result["items"]
    assert any(i.get("kind") == "system" for i in items)


@pytest.mark.asyncio
async def test_list_lists_includes_user_lists(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        await conn.execute(
            "INSERT INTO list (name, kind, position, created_at) "
            "VALUES ('My Picks', 'user', 10, '2026-05-18')"
        )
        await conn.commit()
    result = await list_lists()
    names = {i["name"] for i in result["items"]}
    assert "My Picks" in names
