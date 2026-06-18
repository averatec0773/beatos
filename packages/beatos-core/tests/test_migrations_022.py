import aiosqlite
import pytest

from beatos_core.db import run_migrations


@pytest.mark.asyncio
async def test_022_drops_tokens_adds_audit(tmp_path):
    db = tmp_path / "x.db"
    await run_migrations(db)
    async with aiosqlite.connect(db) as c:
        async with c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('tokens','agent_action_log')"
        ) as cur:
            names = {r[0] for r in await cur.fetchall()}
    assert "tokens" not in names, "tokens table should be dropped by migration 022"
    assert "agent_action_log" in names, "agent_action_log table should be created"
