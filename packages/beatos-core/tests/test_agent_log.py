import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_core.agent_log import (
    clear_agent_actions,
    delete_agent_action,
    list_agent_actions,
    record_agent_action,
)


@pytest.mark.asyncio
async def test_record_and_list(tmp_path):
    db = tmp_path / "x.db"
    await run_migrations(db)
    async with aiosqlite.connect(db) as c:
        await record_agent_action(
            c,
            tool_name="trash_tracks",
            summary={"headline": "Trash 2"},
            client_name="claude-ai",
            status="applied",
            result={"trashed_count": 2},
        )
        await c.commit()
        rows = await list_agent_actions(c, limit=10)
    assert len(rows) == 1
    assert rows[0]["tool_name"] == "trash_tracks"
    assert rows[0]["status"] == "applied"
    assert rows[0]["client_name"] == "claude-ai"
    assert rows[0]["summary"]["headline"] == "Trash 2"
    assert rows[0]["result"]["trashed_count"] == 2


@pytest.mark.asyncio
async def test_list_orders_newest_first_and_handles_string_result(tmp_path):
    db = tmp_path / "x.db"
    await run_migrations(db)
    async with aiosqlite.connect(db) as c:
        await record_agent_action(c, tool_name="a", summary=None,
                                  client_name="", status="refused_read_only", result="read_only")
        await record_agent_action(c, tool_name="b", summary={"headline": "B"},
                                  client_name="", status="applied", result={"ok": True})
        await c.commit()
        rows = await list_agent_actions(c, limit=10)
    assert [r["tool_name"] for r in rows] == ["b", "a"]
    assert rows[1]["result"] == "read_only"  # non-JSON result preserved as string
    assert rows[0]["summary"] == {"headline": "B"}


@pytest.mark.asyncio
async def test_delete_one_action(tmp_path):
    db = tmp_path / "x.db"
    await run_migrations(db)
    async with aiosqlite.connect(db) as c:
        await record_agent_action(c, tool_name="a", summary=None, client_name="",
                                  status="applied", result={"ok": True})
        await record_agent_action(c, tool_name="b", summary=None, client_name="",
                                  status="applied", result={"ok": True})
        await c.commit()
        rows = await list_agent_actions(c, limit=10)
        assert all("id" in r for r in rows)  # list exposes the row id
        target = rows[0]["id"]
        assert await delete_agent_action(c, target) is True
        await c.commit()
        remaining = await list_agent_actions(c, limit=10)
    assert [r["id"] for r in remaining] == [r["id"] for r in rows if r["id"] != target]
    # deleting a missing id is a no-op returning False
    async with aiosqlite.connect(db) as c:
        assert await delete_agent_action(c, 999999) is False


@pytest.mark.asyncio
async def test_clear_all_actions(tmp_path):
    db = tmp_path / "x.db"
    await run_migrations(db)
    async with aiosqlite.connect(db) as c:
        for name in ("a", "b", "c"):
            await record_agent_action(c, tool_name=name, summary=None, client_name="",
                                      status="applied", result={})
        await c.commit()
        n = await clear_agent_actions(c)
        await c.commit()
        rows = await list_agent_actions(c, limit=10)
    assert n == 3
    assert rows == []
