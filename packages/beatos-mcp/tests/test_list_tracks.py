"""list_tracks: filter combinations + pagination + total."""
from __future__ import annotations

import json

import aiosqlite
import pytest

from beatos_mcp.tools.tracks import list_tracks


async def _seed(db, *, count: int = 0, **defaults):
    """Insert `count` tracks with given defaults plus index-suffixed title."""
    async with aiosqlite.connect(db) as conn:
        for i in range(count):
            await conn.execute(
                "INSERT INTO track (title, bpm, genre, producer, key_signature, "
                "created_at, updated_at) VALUES (?, ?, ?, ?, ?, '2026-05-18', '2026-05-18')",
                (
                    defaults.get("title", f"track-{i}"),
                    defaults.get("bpm"),
                    defaults.get("genre"),
                    defaults.get("producer"),
                    defaults.get("key_signature"),
                ),
            )
        await conn.commit()


@pytest.mark.asyncio
async def test_list_empty(fresh_db):
    result = await list_tracks()
    assert result == {
        "items": [], "total": 0, "returned": 0, "limit": 50, "offset": 0
    }


@pytest.mark.asyncio
async def test_list_default_limit_50_returns_total(fresh_db):
    await _seed(fresh_db, count=75)
    result = await list_tracks()
    assert result["total"] == 75
    assert result["returned"] == 50
    assert len(result["items"]) == 50
    assert "hint" in result and "25 more" in result["hint"]


@pytest.mark.asyncio
async def test_list_explicit_limit_and_offset(fresh_db):
    await _seed(fresh_db, count=20)
    page1 = await list_tracks(limit=5, offset=0)
    page2 = await list_tracks(limit=5, offset=5)
    assert len(page1["items"]) == 5 and len(page2["items"]) == 5
    ids_1 = {t["id"] for t in page1["items"]}
    ids_2 = {t["id"] for t in page2["items"]}
    assert ids_1.isdisjoint(ids_2)


@pytest.mark.asyncio
async def test_list_limit_clamped_to_500(fresh_db):
    await _seed(fresh_db, count=3)
    result = await list_tracks(limit=10000)
    assert result["limit"] == 500


@pytest.mark.asyncio
async def test_filter_by_bpm_range(fresh_db):
    async with aiosqlite.connect(fresh_db) as conn:
        for bpm in (90, 120, 140, 160):
            await conn.execute(
                "INSERT INTO track (title, bpm, created_at, updated_at) "
                "VALUES (?, ?, '2026-05-18', '2026-05-18')",
                (f"t{bpm}", bpm),
            )
        await conn.commit()
    result = await list_tracks(bpm_min=110, bpm_max=150)
    bpms = {t["bpm"] for t in result["items"]}
    assert bpms == {120, 140}
    assert result["total"] == 2


@pytest.mark.asyncio
async def test_filter_by_genre_multi_value(fresh_db):
    await _seed(fresh_db, count=1, title="trap", genre=json.dumps(["trap"]))
    await _seed(fresh_db, count=1, title="drill", genre=json.dumps(["drill"]))
    await _seed(fresh_db, count=1, title="other", genre=json.dumps(["lofi"]))
    result = await list_tracks(genres=["trap", "drill"])
    titles = {t["title"] for t in result["items"]}
    assert titles == {"trap", "drill"}


@pytest.mark.asyncio
async def test_filter_by_list_id(fresh_db):
    # Junction table is `track_list` (verified from 002_lists_and_index.sql).
    # `added_at` is required (no default).
    async with aiosqlite.connect(fresh_db) as conn:
        cur = await conn.execute(
            "INSERT INTO list (name, kind, position, created_at) "
            "VALUES ('Picks', 'user', 0, '2026-05-18')"
        )
        list_id = cur.lastrowid
        cur = await conn.execute(
            "INSERT INTO track (title, created_at, updated_at) VALUES ('in', '2026-05-18', '2026-05-18')"
        )
        tid_in = cur.lastrowid
        await conn.execute(
            "INSERT INTO track (title, created_at, updated_at) VALUES ('out', '2026-05-18', '2026-05-18')"
        )
        await conn.execute(
            "INSERT INTO track_list (list_id, track_id, position, added_at) VALUES (?, ?, 0, '2026-05-18')",
            (list_id, tid_in),
        )
        await conn.commit()

    result = await list_tracks(list_id=list_id)
    titles = {t["title"] for t in result["items"]}
    assert titles == {"in"}



@pytest.mark.asyncio
async def test_invalid_sort_by_raises(fresh_db):
    with pytest.raises(ValueError, match="sort_by"):
        await list_tracks(sort_by="nope")
