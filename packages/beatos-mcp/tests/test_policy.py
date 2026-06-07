"""Agent permission policy — confirm / auto_approve / read_only.

Uses `create_list` as the representative write tool. The auto_approve path needs
the apply handlers registered, which importing `beatos_http.routes.tokens` does as
a side effect (create_list handler + the handlers package).
"""
from __future__ import annotations

import pathlib

import aiosqlite
import pytest

import beatos_http.routes.tokens  # noqa: F401 — registers apply handlers
from beatos_core.app_settings.service import set_setting
from beatos_mcp.policy import WritesDisabledError, submit_write
from beatos_mcp.tools.create_list import create_list


async def _count(db, sql, params=()):
    async with aiosqlite.connect(db) as conn:
        async with conn.execute(sql, params) as cur:
            return (await cur.fetchone())[0]


@pytest.mark.asyncio
async def test_confirm_is_default_and_creates_pending_token(fresh_db):
    res = await create_list("My List")
    assert res["status"] == "awaiting_approval"
    assert res["token"]
    assert "expires_at" in res
    # Nothing applied yet: token pending, no list row.
    assert await _count(fresh_db, "SELECT COUNT(*) FROM tokens WHERE status='pending'") == 1
    assert await _count(fresh_db, "SELECT COUNT(*) FROM list WHERE name='My List'") == 0


@pytest.mark.asyncio
async def test_read_only_refuses_write_and_creates_no_token(fresh_db):
    await set_setting("agent_permission_mode", "read_only")
    with pytest.raises(WritesDisabledError):
        await create_list("Nope")
    assert await _count(fresh_db, "SELECT COUNT(*) FROM tokens") == 0


@pytest.mark.asyncio
async def test_auto_approve_applies_immediately(fresh_db):
    await set_setting("agent_permission_mode", "auto_approve")
    res = await create_list("Auto List")
    assert res["status"] == "approved"
    assert res["result"]["name"] == "Auto List"
    assert isinstance(res["result"]["list_id"], int)
    # The write actually landed and the token is consumed (audit trail kept).
    assert await _count(fresh_db, "SELECT COUNT(*) FROM list WHERE name='Auto List'") == 1
    assert await _count(
        fresh_db, "SELECT COUNT(*) FROM tokens WHERE token=? AND status='consumed'",
        (res["token"],),
    ) == 1


@pytest.mark.asyncio
async def test_unknown_mode_falls_back_to_confirm(fresh_db):
    await set_setting("agent_permission_mode", "bogus")
    res = await create_list("Fallback")
    assert res["status"] == "awaiting_approval"


@pytest.mark.asyncio
async def test_submit_write_read_only_is_value_error(fresh_db):
    """WritesDisabledError is a ValueError subclass, so FastMCP surfaces it as a
    clean tool error rather than a 500."""
    await set_setting("agent_permission_mode", "read_only")
    with pytest.raises(ValueError):
        await submit_write("create_list", {"name": "x"})


def test_create_token_is_only_called_via_policy():
    """Invariant: every MCP write goes through submit_write, which is the sole
    creator of 2PC tokens. No tool may call create_token directly (that would
    bypass the permission policy)."""
    import beatos_mcp

    pkg = pathlib.Path(beatos_mcp.__file__).parent
    offenders = [
        p.relative_to(pkg).as_posix()
        for p in pkg.rglob("*.py")
        if "create_token" in p.read_text(encoding="utf-8") and p.name != "policy.py"
    ]
    assert offenders == [], f"create_token used outside policy.py: {offenders}"
