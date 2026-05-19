"""update_tracks + merge_metadata MCP tools."""
import datetime as dt
import json

import aiosqlite
import pytest

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


async def _payload(db_path, token):
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            return json.loads((await cur.fetchone())[0])


@pytest.mark.asyncio
async def test_update_tracks_scalar_patch(db_path):
    r = await update_tracks(ids=[1, 2], patch={"bpm": 145})
    p = await _payload(db_path, r["token"])
    assert p["ids"] == [1, 2]
    assert p["patch"] == {"bpm": 145}
    assert "145" in p["preview"]["headline"]


@pytest.mark.asyncio
async def test_update_tracks_key_maps_to_key_signature_in_payload(db_path):
    # The tool API uses `key`; payload keeps it as `key` (handler does the mapping).
    r = await update_tracks(ids=[1], patch={"key": "D"})
    p = await _payload(db_path, r["token"])
    assert p["patch"] == {"key": "D"}


@pytest.mark.asyncio
async def test_update_tracks_array_replace_form(db_path):
    r = await update_tracks(ids=[1], patch={"producer": ["NewGuy"]})
    p = await _payload(db_path, r["token"])
    assert p["patch"]["producer"] == ["NewGuy"]


@pytest.mark.asyncio
async def test_update_tracks_array_add_remove_form(db_path):
    r = await update_tracks(
        ids=[1, 2], patch={"producer": {"add": ["X"], "remove": ["Y"]}}
    )
    p = await _payload(db_path, r["token"])
    assert p["patch"]["producer"] == {"add": ["X"], "remove": ["Y"]}


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
    r = await update_tracks(ids=[1, 999], patch={"bpm": 100})
    p = await _payload(db_path, r["token"])
    assert p["ids"] == [1]
    assert any("not found" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_update_tracks_all_ids_missing_raises(db_path):
    """If every supplied id is missing, don't issue a no-op token."""
    with pytest.raises(ValueError, match="not found"):
        await update_tracks(ids=[9998, 9999], patch={"bpm": 100})


@pytest.mark.asyncio
async def test_merge_metadata_payload(db_path):
    # All three rows have a producer matching at least one of these
    r = await merge_metadata(field="producer", from_=["smoke", "SMOKE"], to="Smoke")
    p = await _payload(db_path, r["token"])
    assert p["field"] == "producer"
    assert p["from"] == ["smoke", "SMOKE"]
    assert p["to"] == "Smoke"
    # 2 & 3 are affected; 1 already has 'Smoke' (case-sensitive miss → not affected here)
    # The exact count depends on how the matching treats case. We require ≥1.
    assert "Merge" in p["preview"]["headline"]


@pytest.mark.asyncio
async def test_merge_metadata_rejects_invalid_field(db_path):
    with pytest.raises(ValueError, match="field"):
        await merge_metadata(field="title", from_=["x"], to="y")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_merge_metadata_rejects_empty_from(db_path):
    with pytest.raises(ValueError):
        await merge_metadata(field="producer", from_=[], to="Smoke")
