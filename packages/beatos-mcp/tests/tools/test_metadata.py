"""update_tracks + merge_metadata MCP tools — apply directly (L1), audit the preview."""
import datetime as dt
import json

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.agent_log import list_agent_actions
from beatos_core.db import run_migrations
from beatos_mcp.tools.metadata import update_tracks, merge_metadata


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, bpm, key_signature, producer, genre, mood, created_at, updated_at) "
            "VALUES (1, 'Beat A', 140, 'C', '[\"Smoke\"]', '[\"trap\"]', NULL, ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, bpm, producer, genre, created_at, updated_at) "
            "VALUES (2, 'Beat B', 90, '[\"smoke\"]', '[\"lofi\"]', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, producer, created_at, updated_at) "
            "VALUES (3, 'Beat C', '[\"SMOKE\", \"other\"]', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


async def _latest_summary(db_path) -> dict:
    """The preview now lives in the audit log summary (no more token payload)."""
    async with aiosqlite.connect(db_path) as conn:
        rows = await list_agent_actions(conn, limit=1)
    return rows[0]["summary"]


@pytest.mark.asyncio
async def test_update_tracks_scalar_patch(db_path):
    res = await update_tracks(ids=[1, 2], patch={"bpm": 145})
    assert res["status"] == "applied"
    assert res["result"]["ids"] == [1, 2]
    summ = await _latest_summary(db_path)
    assert "145" in summ["headline"]
    # The patch landed in the DB.
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT bpm FROM track WHERE id IN (1,2) ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    assert [r[0] for r in rows] == [145, 145]


@pytest.mark.asyncio
async def test_update_tracks_key_maps_to_key_signature(db_path):
    # The tool API uses `key`; the handler maps it to the key_signature column.
    res = await update_tracks(ids=[1], patch={"key": "D"})
    assert res["result"]["ids"] == [1]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT key_signature FROM track WHERE id=1") as cur:
            assert (await cur.fetchone())[0] == "D"


@pytest.mark.asyncio
async def test_update_tracks_array_replace_form(db_path):
    res = await update_tracks(ids=[1], patch={"producer": ["NewGuy"]})
    assert res["result"]["ids"] == [1]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT producer FROM track WHERE id=1") as cur:
            assert json.loads((await cur.fetchone())[0]) == ["NewGuy"]


@pytest.mark.asyncio
async def test_update_tracks_array_add_remove_form(db_path):
    res = await update_tracks(
        ids=[1, 2], patch={"producer": {"add": ["X"], "remove": ["Smoke"]}}
    )
    assert res["result"]["ids"] == [1, 2]
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT producer FROM track WHERE id=1") as cur:
            producers = json.loads((await cur.fetchone())[0])
    # 'Smoke' removed, 'X' added.
    assert "X" in producers and "Smoke" not in producers


@pytest.mark.asyncio
async def test_update_tracks_rejects_empty_patch(db_path):
    with pytest.raises(ValueError, match="patch"):
        await update_tracks(ids=[1], patch={})


@pytest.mark.asyncio
async def test_update_tracks_rejects_unknown_field(db_path):
    with pytest.raises(ValueError, match="unknown"):
        await update_tracks(ids=[1], patch={"frobnicate": 1})


@pytest.mark.asyncio
async def test_update_tracks_caps_ids_at_500(db_path):
    with pytest.raises(ValueError, match="500"):
        await update_tracks(ids=list(range(501)), patch={"bpm": 100})


@pytest.mark.asyncio
async def test_update_tracks_warns_about_missing_ids(db_path):
    res = await update_tracks(ids=[1, 999], patch={"bpm": 100})
    assert res["result"]["ids"] == [1]
    summ = await _latest_summary(db_path)
    assert any("not found" in w.lower() for w in summ["warnings"])


@pytest.mark.asyncio
async def test_update_tracks_all_ids_missing_raises(db_path):
    """If every supplied id is missing, raise before applying (no no-op write)."""
    with pytest.raises(ValueError, match="not found"):
        await update_tracks(ids=[9998, 9999], patch={"bpm": 100})


@pytest.mark.asyncio
async def test_merge_metadata_applies_and_previews(db_path):
    # All three rows have a producer matching at least one of these
    res = await merge_metadata(field="producer", from_=["smoke", "SMOKE"], to="Smoke")
    assert res["status"] == "applied"
    # 2 & 3 carry 'smoke'/'SMOKE' and are rewritten; 1 already has 'Smoke'.
    assert res["result"]["affected_count"] >= 1
    summ = await _latest_summary(db_path)
    assert "Merge" in summ["headline"]
    # The rename landed: no lowercase/uppercase alias remains.
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT producer FROM track WHERE id IN (2,3) ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    for (raw,) in rows:
        producers = json.loads(raw)
        assert "smoke" not in producers and "SMOKE" not in producers
        assert "Smoke" in producers


@pytest.mark.asyncio
async def test_merge_metadata_rejects_invalid_field(db_path):
    with pytest.raises(ValueError, match="field"):
        await merge_metadata(field="title", from_=["x"], to="y")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_merge_metadata_rejects_empty_from(db_path):
    with pytest.raises(ValueError):
        await merge_metadata(field="producer", from_=[], to="Smoke")
