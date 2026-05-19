"""Lifecycle tools: trash/restore/purge — issue 2PC tokens, no direct writes."""
import datetime as dt
import json

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_mcp.tools.lifecycle import trash_tracks, restore_tracks, purge_tracks


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    # Seed 3 tracks
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        for i, title in enumerate(["Beat A", "Beat B", "Beat C"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) "
                "VALUES (?, ?, ?, ?)",
                (i, title, now, now),
            )
        await conn.commit()
    return p


async def _fetch_payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return json.loads(row[0])


@pytest.mark.asyncio
async def test_trash_tracks_issues_token_with_preview(db_path):
    res = await trash_tracks(ids=[1, 2, 3])
    assert "token" in res
    p = await _fetch_payload(db_path, res["token"])
    assert p["ids"] == [1, 2, 3]
    assert p["preview"]["headline"].startswith("Trash 3 tracks")
    assert len(p["preview"]["sample"]) == 3
    assert "#1 Beat A" in p["preview"]["sample"]
    assert p["preview"].get("risk") is None


@pytest.mark.asyncio
async def test_trash_tracks_warns_on_already_trashed(db_path):
    # Pre-trash id=2
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track SET deleted_at=? WHERE id=2", ("2026-01-01",)
        )
        await conn.commit()
    res = await trash_tracks(ids=[1, 2, 3])
    p = await _fetch_payload(db_path, res["token"])
    assert p["ids"] == [1, 3]  # 2 filtered out
    assert any("already" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_trash_tracks_rejects_unknown_id(db_path):
    res = await trash_tracks(ids=[1, 999])
    p = await _fetch_payload(db_path, res["token"])
    assert p["ids"] == [1]
    assert any("not found" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_trash_tracks_rejects_empty(db_path):
    with pytest.raises(ValueError):
        await trash_tracks(ids=[])


@pytest.mark.asyncio
async def test_trash_tracks_caps_at_500(db_path):
    with pytest.raises(ValueError, match="500"):
        await trash_tracks(ids=list(range(501)))


@pytest.mark.asyncio
async def test_restore_tracks_payload_only_includes_trashed(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at=? WHERE id IN (1,2)", ("x",))
        await conn.commit()
    res = await restore_tracks(ids=[1, 2, 3])
    p = await _fetch_payload(db_path, res["token"])
    assert p["ids"] == [1, 2]
    assert any("not in trash" in w.lower() or "not trashed" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_purge_tracks_marks_destructive(db_path):
    res = await purge_tracks(ids=[1, 2])
    p = await _fetch_payload(db_path, res["token"])
    assert p["preview"]["risk"] == "destructive"
    assert "PERMANENTLY" in p["preview"]["headline"].upper()


@pytest.mark.asyncio
async def test_trash_tracks_raises_when_all_already_trashed(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at='2026-01-01' WHERE id IN (1,2)")
        await conn.commit()
    with pytest.raises(ValueError, match="already trashed or not found"):
        await trash_tracks(ids=[1, 2])


@pytest.mark.asyncio
async def test_restore_tracks_raises_when_all_already_live(db_path):
    # Tracks 1, 2, 3 are not trashed (deleted_at IS NULL) — none eligible for restore
    with pytest.raises(ValueError, match="already restored or not found"):
        await restore_tracks(ids=[1, 2, 3])


@pytest.mark.asyncio
async def test_purge_tracks_raises_when_all_ids_unknown(db_path):
    with pytest.raises(ValueError, match="not found"):
        await purge_tracks(ids=[9000, 9001])
