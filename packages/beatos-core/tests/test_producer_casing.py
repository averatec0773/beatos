"""Case-insensitive producer canonicalization (v0.0.x).

Producers are free-text JSON-array values, so 'Metro' and 'metro' used to be two
distinct producers. We canonicalize on write (reuse an existing casing on a
case-insensitive match) and provide a one-time merge for legacy dupes.
"""
from __future__ import annotations

import datetime as dt
import aiosqlite
import pytest

from beatos_core.db import resolve_db_path
from beatos_core.tracks.service import (
    bulk_update_tracks,
    canonicalize_producers,
    create_track,
    get_track,
    list_distinct_values,
    normalize_producer_casing,
    update_track,
)


async def _seed_raw(producer_json: str) -> None:
    """Insert a track with a raw producer array, bypassing canonicalize-on-write
    (simulates pre-existing/legacy divergent casings)."""
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(resolve_db_path()) as conn:
        await conn.execute(
            "INSERT INTO track (title, producer, created_at, updated_at) VALUES (?,?,?,?)",
            ("t", producer_json, now, now),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_update_reuses_existing_producer_casing(fresh_db):
    a = await create_track("A")
    await update_track(a.id, {"producer": ["Metro"]})
    b = await create_track("B")
    await update_track(b.id, {"producer": ["metro"]})  # only case differs
    assert (await get_track(b.id)).producer == ["Metro"]
    assert await list_distinct_values("producer") == ["Metro"]  # single producer


@pytest.mark.asyncio
async def test_canonicalize_dedupes_strips_keeps_new(fresh_db):
    a = await create_track("A")
    await update_track(a.id, {"producer": ["Metro"]})
    out = await canonicalize_producers([" metro ", "METRO", "Drake"])
    assert out == ["Metro", "Drake"]  # snapped to existing, deduped, new kept


@pytest.mark.asyncio
async def test_canonicalize_new_list_is_internally_consistent(fresh_db):
    # No existing producers → within one list, later variants snap to the first.
    assert await canonicalize_producers(["Metro", "metro", "METRO"]) == ["Metro"]


@pytest.mark.asyncio
async def test_bulk_add_canonicalizes_producer(fresh_db):
    seed = await create_track("seed")
    await update_track(seed.id, {"producer": ["Metro"]})
    t = await create_track("x")
    await bulk_update_tracks([t.id], {"producer": {"add": ["metro"]}})
    assert (await get_track(t.id)).producer == ["Metro"]


@pytest.mark.asyncio
async def test_normalize_merges_to_most_frequent(fresh_db):
    await _seed_raw('["Metro"]')
    await _seed_raw('["Metro"]')
    await _seed_raw('["metro"]')  # less frequent casing

    plan = await normalize_producer_casing(dry_run=True)
    assert plan["dry_run"] is True
    assert plan["groups"] == [{"canonical": "Metro", "merged_from": ["metro"]}]
    assert plan["affected"] == 1  # one track carries the non-canonical casing

    res = await normalize_producer_casing()
    assert res["affected"] == 1
    assert await list_distinct_values("producer") == ["Metro"]


@pytest.mark.asyncio
async def test_normalize_noop_when_no_dupes(fresh_db):
    await _seed_raw('["Metro"]')
    await _seed_raw('["Drake"]')
    res = await normalize_producer_casing()
    assert res["groups"] == [] and res["affected"] == 0
