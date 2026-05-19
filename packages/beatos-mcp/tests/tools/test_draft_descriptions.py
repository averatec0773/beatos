"""draft_descriptions MCP tool tests."""
import datetime as dt
import json

import aiosqlite
import pytest

from beatos_core.db import run_migrations
from beatos_mcp.tools.draft_descriptions import draft_descriptions


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        for i, title in enumerate(["A", "B"], start=1):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (i, title, now, now),
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
async def test_happy(db_path):
    r = await draft_descriptions(
        items=[
            {"track_id": 1, "text": "moody trap intro"},
            {"track_id": 2, "text": "lofi jazz beat"},
        ]
    )
    p = await _payload(db_path, r["token"])
    assert len(p["items"]) == 2
    assert "2 tracks" in p["preview"]["headline"]


@pytest.mark.asyncio
async def test_empty_rejected(db_path):
    with pytest.raises(ValueError, match="non-empty"):
        await draft_descriptions(items=[])


@pytest.mark.asyncio
async def test_missing_track_warned(db_path):
    r = await draft_descriptions(
        items=[{"track_id": 1, "text": "x"}, {"track_id": 99, "text": "y"}]
    )
    p = await _payload(db_path, r["token"])
    assert len(p["items"]) == 1
    assert any("not found" in w.lower() for w in p["preview"]["warnings"])


@pytest.mark.asyncio
async def test_all_missing_raises(db_path):
    with pytest.raises(ValueError, match="not found"):
        await draft_descriptions(items=[{"track_id": 999, "text": "x"}])


@pytest.mark.asyncio
async def test_duplicate_track_ids_rejected(db_path):
    with pytest.raises(ValueError, match="duplicate"):
        await draft_descriptions(
            items=[{"track_id": 1, "text": "a"}, {"track_id": 1, "text": "b"}]
        )


@pytest.mark.asyncio
async def test_text_too_long_rejected(db_path):
    with pytest.raises(ValueError, match="too long"):
        await draft_descriptions(items=[{"track_id": 1, "text": "x" * 5001}])


@pytest.mark.asyncio
async def test_non_int_track_id_rejected(db_path):
    with pytest.raises(ValueError, match="track_id"):
        await draft_descriptions(items=[{"track_id": "1", "text": "x"}])


@pytest.mark.asyncio
async def test_bool_track_id_rejected(db_path):
    with pytest.raises(ValueError, match="track_id"):
        await draft_descriptions(items=[{"track_id": True, "text": "x"}])


@pytest.mark.asyncio
async def test_non_string_text_rejected(db_path):
    with pytest.raises(ValueError, match="text"):
        await draft_descriptions(items=[{"track_id": 1, "text": 42}])


@pytest.mark.asyncio
async def test_unknown_field_rejected(db_path):
    with pytest.raises(ValueError, match="unknown"):
        await draft_descriptions(items=[{"track_id": 1, "text": "x", "extra": "y"}])


@pytest.mark.asyncio
async def test_item_not_dict_rejected(db_path):
    with pytest.raises(ValueError, match="dict"):
        await draft_descriptions(items=[[1, "x"]])


@pytest.mark.asyncio
async def test_over_500_items_rejected(db_path):
    with pytest.raises(ValueError, match="500"):
        await draft_descriptions(
            items=[{"track_id": i, "text": "x"} for i in range(501)]
        )
