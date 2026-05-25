"""search_tracks: query-string search via shared parse_query."""
from __future__ import annotations

import json

import aiosqlite
import pytest
from beatos_mcp.tools.search import search_tracks


async def _seed_track(db, *, title, genre=None, producer=None, key=None, bpm=None):
    async with aiosqlite.connect(db) as conn:
        await conn.execute(
            "INSERT INTO track (title, bpm, genre, producer, key_signature, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, '2026-05-25', '2026-05-25')",
            (title, bpm,
             json.dumps(genre) if genre else None,
             json.dumps(producer) if producer else None,
             key),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_search_field_token(fresh_db):
    await _seed_track(fresh_db, title="Midnight", genre=["trap"])
    await _seed_track(fresh_db, title="Sunrise", genre=["drill"])
    res = await search_tracks(query="genre:trap")
    assert [t["title"] for t in res["items"]] == ["Midnight"]


@pytest.mark.asyncio
async def test_search_free_text_matches_producer(fresh_db):
    await _seed_track(fresh_db, title="Midnight", producer=["AVERATEC"])
    await _seed_track(fresh_db, title="Sunrise", producer=["smoke"])
    res = await search_tracks(query="averatec")
    assert [t["title"] for t in res["items"]] == ["Midnight"]


@pytest.mark.asyncio
async def test_search_bpm_operator(fresh_db):
    await _seed_track(fresh_db, title="Slow", bpm=120)
    await _seed_track(fresh_db, title="Fast", bpm=150)
    res = await search_tracks(query="bpm:>=140")
    assert [t["title"] for t in res["items"]] == ["Fast"]
