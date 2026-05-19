"""List-curation MCP tools — issue 2PC tokens only, no direct writes."""
import datetime as dt
import json

import aiosqlite
import pytest

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


async def _payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            return json.loads((await cur.fetchone())[0])


@pytest.mark.asyncio
async def test_update_list_rename_happy(db_path):
    r = await update_list(list_id=10, name="Renamed")
    p = await _payload(db_path, r["token"])
    assert p["list_id"] == 10
    assert p["name"] == "Renamed"
    assert "Demo" in p["preview"]["headline"] or "Renamed" in p["preview"]["headline"]


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
    r = await update_list(list_id=10, name="Other")
    p = await _payload(db_path, r["token"])
    assert p["list_id"] == 10
    assert p["name"] == "Other"
    assert any("already exists" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_delete_list_marks_destructive(db_path):
    r = await delete_list(list_id=10)
    p = await _payload(db_path, r["token"])
    assert p["preview"]["risk"] == "destructive"
    assert "PERMANENTLY" in p["preview"]["headline"].upper()


@pytest.mark.asyncio
async def test_delete_list_refuses_system(db_path):
    with pytest.raises(ValueError, match="system"):
        await delete_list(list_id=1)


@pytest.mark.asyncio
async def test_add_tracks_to_list_idempotent_warning(db_path):
    # track 1 is already in list 10
    r = await add_tracks_to_list(list_id=10, track_ids=[1, 4])
    p = await _payload(db_path, r["token"])
    assert p["track_ids"] == [4]  # 1 filtered out
    assert any("already" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_add_tracks_to_list_missing_list(db_path):
    with pytest.raises(ValueError, match="list_id"):
        await add_tracks_to_list(list_id=999, track_ids=[1])


@pytest.mark.asyncio
async def test_remove_tracks_from_list_idempotent_warning(db_path):
    r = await remove_tracks_from_list(list_id=10, track_ids=[1, 99])
    p = await _payload(db_path, r["token"])
    # id=99 isn't a track at all; id=1 IS a member → keep id=1, warn about 99
    assert p["track_ids"] == [1]
    assert any("not in list" in w.lower() or "not found" in w.lower() for w in p["preview"]["warnings"])


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
    r = await reorder_list(list_id=10, track_ids=[3, 1, 2])
    p = await _payload(db_path, r["token"])
    assert p["track_ids"] == [3, 1, 2]
    assert "Reorder" in p["preview"]["headline"]
