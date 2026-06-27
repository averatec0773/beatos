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


from beatos_core.agent_log import list_agent_actions
from beatos_core.app_settings.service import set_setting
from beatos_core.approvals import RowVanishedError, register_apply_handler
from beatos_core.db import resolve_db_path
from beatos_core.agent_permission import (
    WritesDisabledError,
    get_permission_mode,
    submit_write,
)


@register_apply_handler("__core_ok__")
async def _h_ok(conn, payload):
    return {"ok": payload["v"]}


@register_apply_handler("__core_fail__")
async def _h_fail(conn, payload):
    raise RowVanishedError("boom")


@pytest.mark.asyncio
async def test_enabled_applies_and_audits(fresh_db):
    out = await submit_write("__core_ok__", {"v": 1, "preview": {"headline": "x"}})
    assert out["status"] == "applied"
    assert out["result"]["ok"] == 1
    async with aiosqlite.connect(str(resolve_db_path())) as c:
        rows = await list_agent_actions(c, limit=10)
    assert rows[0]["tool_name"] == "__core_ok__"
    assert rows[0]["status"] == "applied"


@pytest.mark.asyncio
async def test_read_only_refuses_and_audits(fresh_db):
    await set_setting("agent_permission_mode", "read_only")
    with pytest.raises(WritesDisabledError):
        await submit_write("__core_ok__", {"v": 1})
    async with aiosqlite.connect(str(resolve_db_path())) as c:
        rows = await list_agent_actions(c, limit=10)
    assert rows[0]["status"] == "refused_read_only"


@pytest.mark.asyncio
async def test_legacy_mode_maps_to_enabled(fresh_db):
    await set_setting("agent_permission_mode", "auto_approve")
    assert await get_permission_mode() == "enabled"
    await set_setting("agent_permission_mode", "confirm")
    assert await get_permission_mode() == "enabled"


@pytest.mark.asyncio
async def test_failed_write_records_and_raises(fresh_db):
    with pytest.raises(RowVanishedError):
        await submit_write("__core_fail__", {"preview": {"headline": "x"}})
    async with aiosqlite.connect(str(resolve_db_path())) as c:
        rows = await list_agent_actions(c, limit=10)
    assert any(r["tool_name"] == "__core_fail__" and r["status"] == "failed" for r in rows)


@pytest.mark.asyncio
async def test_client_name_is_recorded(fresh_db):
    await submit_write("__core_ok__", {"v": 2}, client_name="chat")
    async with aiosqlite.connect(str(resolve_db_path())) as c:
        rows = await list_agent_actions(c, limit=10)
    assert rows[0]["client_name"] == "chat"
