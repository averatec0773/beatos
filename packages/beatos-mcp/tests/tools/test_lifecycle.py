"""Lifecycle tools: trash/restore/purge — apply directly (L1), audit the preview."""
import datetime as dt

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.agent_log import list_agent_actions
from beatos_core.db import run_migrations
from beatos_mcp.tools.lifecycle import purge_tracks, restore_tracks, trash_tracks


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


async def _latest_summary(db_path) -> dict:
    """The preview now lives in the audit log summary (no more token payload)."""
    async with aiosqlite.connect(db_path) as conn:
        rows = await list_agent_actions(conn, limit=1)
    return rows[0]["summary"]


@pytest.mark.asyncio
async def test_trash_tracks_applies_with_preview(db_path):
    res = await trash_tracks(ids=[1, 2, 3])
    assert res["status"] == "applied"
    assert res["result"]["ids"] == [1, 2, 3]
    summ = await _latest_summary(db_path)
    assert summ["headline"].startswith("Trash 3 tracks")
    assert len(summ["sample"]) == 3
    assert "#1 Beat A" in summ["sample"]
    assert summ.get("risk") is None
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM track WHERE deleted_at IS NOT NULL"
        ) as cur:
            assert (await cur.fetchone())[0] == 3


@pytest.mark.asyncio
async def test_trash_tracks_warns_on_already_trashed(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track SET deleted_at=? WHERE id=2", ("2026-01-01",)
        )
        await conn.commit()
    res = await trash_tracks(ids=[1, 2, 3])
    assert res["result"]["ids"] == [1, 3]  # 2 filtered out
    summ = await _latest_summary(db_path)
    assert any("already" in w.lower() for w in summ["warnings"])


@pytest.mark.asyncio
async def test_trash_tracks_rejects_unknown_id(db_path):
    res = await trash_tracks(ids=[1, 999])
    assert res["result"]["ids"] == [1]
    summ = await _latest_summary(db_path)
    assert any("not found" in w.lower() for w in summ["warnings"])


@pytest.mark.asyncio
async def test_trash_tracks_rejects_empty(db_path):
    with pytest.raises(ValueError):
        await trash_tracks(ids=[])


@pytest.mark.asyncio
async def test_trash_tracks_caps_at_500(db_path):
    with pytest.raises(ValueError, match="500"):
        await trash_tracks(ids=list(range(501)))


@pytest.mark.asyncio
async def test_restore_tracks_only_restores_trashed(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at=? WHERE id IN (1,2)", ("x",))
        await conn.commit()
    res = await restore_tracks(ids=[1, 2, 3])
    assert res["result"]["ids"] == [1, 2]
    summ = await _latest_summary(db_path)
    assert any(
        "not in trash" in w.lower() or "not trashed" in w.lower()
        for w in summ["warnings"]
    )


@pytest.mark.asyncio
async def test_purge_tracks_marks_destructive(db_path):
    res = await purge_tracks(ids=[1, 2])
    assert res["status"] == "applied"
    summ = await _latest_summary(db_path)
    assert summ["risk"] == "destructive"
    assert "PERMANENTLY" in summ["headline"].upper()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT COUNT(*) FROM track") as cur:
            assert (await cur.fetchone())[0] == 1  # 2 of 3 purged


@pytest.mark.asyncio
async def test_trash_tracks_raises_when_all_already_trashed(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at='2026-01-01' WHERE id IN (1,2)")
        await conn.commit()
    with pytest.raises(ValueError, match="nothing to trash — 2 already in trash"):
        await trash_tracks(ids=[1, 2])


@pytest.mark.asyncio
async def test_trash_tracks_error_distinguishes_missing_from_trashed(db_path):
    # QA P2-12a: the all-fail error must name each reason separately rather than
    # merging "already trashed OR not found" into one ambiguous string.
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("UPDATE track SET deleted_at='2026-01-01' WHERE id=1")
        await conn.commit()
    with pytest.raises(
        ValueError, match="nothing to trash — 1 not found, 1 already in trash"
    ):
        await trash_tracks(ids=[9999, 1])


@pytest.mark.asyncio
async def test_restore_tracks_raises_when_all_already_live(db_path):
    with pytest.raises(ValueError, match="nothing to restore — 3 not in trash"):
        await restore_tracks(ids=[1, 2, 3])


@pytest.mark.asyncio
async def test_purge_tracks_raises_when_all_ids_unknown(db_path):
    with pytest.raises(ValueError, match="not found"):
        await purge_tracks(ids=[9000, 9001])
