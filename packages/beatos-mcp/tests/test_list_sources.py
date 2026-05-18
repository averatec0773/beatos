"""list_sources: full list of sources, no pagination."""
from __future__ import annotations

import aiosqlite
import pytest

from beatos_mcp.tools.sources import list_sources


@pytest.mark.asyncio
async def test_list_sources_empty(fresh_db):
    result = await list_sources()
    assert result == {"items": []}


@pytest.mark.asyncio
async def test_list_sources_returns_seeded_rows(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        await conn.execute(
            "INSERT INTO source (name, root_path, position, created_at) VALUES "
            "('Drive', '/Volumes/Drive', 0, '2026-05-18'), "
            "('Local',  '/Users/x/beats', 1, '2026-05-18')"
        )
        await conn.commit()

    result = await list_sources()
    items = result["items"]
    assert len(items) == 2
    names = {i["name"] for i in items}
    assert names == {"Drive", "Local"}
    for i in items:
        assert {"id", "name", "root_path", "position"} <= set(i)
