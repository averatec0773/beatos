"""List-curation MCP tools — apply directly (L1), audit the preview."""
import datetime as dt

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.agent_log import list_agent_actions
from beatos_core.db import run_migrations
from beatos_mcp.tools.list_curation import (
    add_tracks_to_list,
    delete_list,
    remove_tracks_from_list,
    reorder_list,
    update_list,
)


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        # Tracks
        for i, title in enumerate(["A", "B", "C", "D"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?,?,?,?)",
                (i, title, now, now),
            )
        # Lists: id=1 system (seeded by migration 004), id=10 user
        await conn.execute(
            "INSERT INTO list (id, name, kind, position, created_at) VALUES (10, 'Demo', 'user', 0, ?)",
            (now,),
        )
        # Members: list 10 has tracks 1,2,3 at positions 0,1,2
        for pos, tid in enumerate([1, 2, 3]):
            await conn.execute(
                "INSERT INTO track_list (list_id, track_id, position, added_at) VALUES (10, ?, ?, ?)",
                (tid, pos, now),
            )
        await conn.commit()
    return p


async def _latest_summary(db_path) -> dict:
    """The preview now lives in the audit log summary (no more token payload)."""
    async with aiosqlite.connect(db_path) as conn:
        rows = await list_agent_actions(conn, limit=1)
    return rows[0]["summary"]


@pytest.mark.asyncio
async def test_update_list_rename_happy(db_path):
    res = await update_list(list_id=10, name="Renamed")
    assert res["status"] == "applied"
    assert res["result"]["list_id"] == 10
    assert res["result"]["name"] == "Renamed"
    summ = await _latest_summary(db_path)
    assert "Demo" in summ["headline"] or "Renamed" in summ["headline"]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT name FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == "Renamed"


@pytest.mark.asyncio
async def test_update_list_refuses_system_kind(db_path):
    with pytest.raises(ValueError, match="system"):
        await update_list(list_id=1, name="x")


@pytest.mark.asyncio
async def test_update_list_empty_name_rejected(db_path):
    with pytest.raises(ValueError):
        await update_list(list_id=10, name="")


@pytest.mark.asyncio
async def test_update_list_collision_warning(db_path):
    # Seed a second user list whose name is what we'll try to rename list 10 to
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO list (id, name, kind, position, created_at) "
            "VALUES (11, 'Other', 'user', 1, ?)",
            (now,),
        )
        await conn.commit()
    res = await update_list(list_id=10, name="Other")
    assert res["result"]["list_id"] == 10
    assert res["result"]["name"] == "Other"
    summ = await _latest_summary(db_path)
    assert any("already exists" in w.lower() for w in summ["warnings"])


@pytest.mark.asyncio
async def test_delete_list_marks_destructive(db_path):
    res = await delete_list(list_id=10)
    assert res["status"] == "applied"
    summ = await _latest_summary(db_path)
    assert summ["risk"] == "destructive"
    assert "PERMANENTLY" in summ["headline"].upper()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM list WHERE id=10") as cur:
            assert (await cur.fetchone())[0] == 0


@pytest.mark.asyncio
async def test_delete_list_refuses_system(db_path):
    with pytest.raises(ValueError, match="system"):
        await delete_list(list_id=1)


@pytest.mark.asyncio
async def test_add_tracks_to_list_idempotent_warning(db_path):
    # track 1 is already in list 10
    res = await add_tracks_to_list(list_id=10, track_ids=[1, 4])
    # 1 filtered out (already a member) → only 4 added
    assert res["result"]["added_count"] == 1
    summ = await _latest_summary(db_path)
    assert any("already" in w.lower() for w in summ["warnings"])
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id FROM track_list WHERE list_id=10 ORDER BY track_id"
        ) as cur:
            members = [r[0] for r in await cur.fetchall()]
    assert members == [1, 2, 3, 4]


@pytest.mark.asyncio
async def test_add_tracks_to_list_missing_list(db_path):
    with pytest.raises(ValueError, match="list_id"):
        await add_tracks_to_list(list_id=999, track_ids=[1])


@pytest.mark.asyncio
async def test_remove_tracks_from_list_idempotent_warning(db_path):
    res = await remove_tracks_from_list(list_id=10, track_ids=[1, 99])
    # id=99 isn't a track at all; id=1 IS a member → remove only id=1, warn about 99
    assert res["result"]["removed_count"] == 1
    summ = await _latest_summary(db_path)
    assert any(
        "not in list" in w.lower() or "not found" in w.lower() for w in summ["warnings"]
    )
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id FROM track_list WHERE list_id=10 ORDER BY track_id"
        ) as cur:
            members = [r[0] for r in await cur.fetchall()]
    assert members == [2, 3]  # id=1 removed


@pytest.mark.asyncio
async def test_reorder_list_full_membership_required(db_path):
    # list 10 contains {1,2,3}; provide {1,2} → missing 3
    with pytest.raises(ValueError, match="missing"):
        await reorder_list(list_id=10, track_ids=[1, 2])


@pytest.mark.asyncio
async def test_reorder_list_extras_rejected(db_path):
    with pytest.raises(ValueError, match="extra"):
        await reorder_list(list_id=10, track_ids=[1, 2, 3, 4])


@pytest.mark.asyncio
async def test_reorder_list_happy(db_path):
    res = await reorder_list(list_id=10, track_ids=[3, 1, 2])
    assert res["result"]["list_id"] == 10
    assert res["result"]["count"] == 3
    summ = await _latest_summary(db_path)
    assert "Reorder" in summ["headline"]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT track_id, position FROM track_list WHERE list_id=10 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(3, 0), (1, 1), (2, 2)]
