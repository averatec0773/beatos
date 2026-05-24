"""Tests for multi-value JSON-array semantics on producer, genre, mood (v0.0.12)."""
from __future__ import annotations

import aiosqlite
import pytest

from beatos_core.db import run_migrations, resolve_db_path
from beatos_core.tracks.service import (
    create_track,
    list_tracks,
    list_distinct_values,
    update_track,
    get_track,
)


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)

    yield


# --- migration idempotency ---

@pytest.mark.asyncio
async def test_migration_idempotent_does_not_double_wrap():
    """Running migrations a second time must not double-wrap JSON arrays."""
    db_path = resolve_db_path()
    # Insert a track with a raw string (simulates pre-migration state).
    async with aiosqlite.connect(db_path) as conn:
        import datetime as _dt
        now = _dt.datetime.now(_dt.timezone.utc).isoformat()
        await conn.execute(
            "INSERT INTO track (title, producer, created_at, updated_at) "
            "VALUES (?, ?, ?, ?)",
            ("Legacy", "oldprod", now, now),
        )
        await conn.commit()

    # Run migrations again — migration 006 must be a no-op for already-applied.
    # The guard WHERE NOT LIKE '[%' prevents re-wrapping.
    await run_migrations(db_path)

    # Now run the SQL manually a second time to verify the guard works.
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "UPDATE track SET producer = json_array(producer) "
            "WHERE producer IS NOT NULL AND producer NOT LIKE '[%'"
        )
        await conn.commit()
        async with conn.execute("SELECT producer FROM track WHERE title = 'Legacy'") as cur:
            row = await cur.fetchone()

    import json
    parsed = json.loads(row[0])
    # Must still be a single-element array, not ['["oldprod"]'] or similar.
    assert parsed == ["oldprod"], f"Unexpected value: {parsed!r}"


# --- round-trip ---

@pytest.mark.asyncio
async def test_track_with_multi_producer_round_trips():
    t = await create_track("Multi")
    updated = await update_track(t.id, {"producer": ["a", "b"]})
    assert updated.producer == ["a", "b"]

    fetched = await get_track(updated.id)
    assert fetched is not None
    assert fetched.producer == ["a", "b"]


@pytest.mark.asyncio
async def test_update_track_overwrites_producer_list():
    t = await create_track("T")
    await update_track(t.id, {"producer": ["x"]})
    updated = await update_track(t.id, {"producer": ["x", "y"]})
    assert updated.producer == ["x", "y"]


# --- list_tracks filtering ---

@pytest.mark.asyncio
async def test_list_tracks_filter_single_producer_in_array():
    a = await create_track("A")
    b = await create_track("B")
    await update_track(a.id, {"producer": ["a", "b"]})
    await update_track(b.id, {"producer": ["c"]})

    rows = await list_tracks(producers=["a"])
    assert len(rows) == 1
    assert rows[0].title == "A"


@pytest.mark.asyncio
async def test_list_tracks_filter_or_within_producers():
    a = await create_track("A")
    b = await create_track("B")
    c = await create_track("C")
    await update_track(a.id, {"producer": ["a"]})
    await update_track(b.id, {"producer": ["b"]})
    await update_track(c.id, {"producer": ["c"]})

    rows = await list_tracks(producers=["a", "b"])
    titles = {r.title for r in rows}
    assert titles == {"A", "B"}


@pytest.mark.asyncio
async def test_list_tracks_filter_and_across_fields():
    a = await create_track("A")
    b = await create_track("B")
    c = await create_track("C")
    await update_track(a.id, {"producer": ["a"], "genre": ["pop"]})
    await update_track(b.id, {"producer": ["a"], "genre": ["rock"]})
    await update_track(c.id, {"producer": ["b"], "genre": ["pop"]})

    rows = await list_tracks(producers=["a"], genres=["pop"])
    assert len(rows) == 1
    assert rows[0].title == "A"


# --- list_distinct_values ---

@pytest.mark.asyncio
async def test_list_distinct_values_producer_flat():
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    await update_track(t1.id, {"producer": ["a", "b"]})
    await update_track(t2.id, {"producer": ["b", "c"]})

    vals = await list_distinct_values("producer")
    assert vals == ["a", "b", "c"]


@pytest.mark.asyncio
async def test_list_distinct_values_genre_flat():
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    await update_track(t1.id, {"genre": ["pop", "rock"]})
    await update_track(t2.id, {"genre": ["jazz"]})

    vals = await list_distinct_values("genre")
    assert vals == ["jazz", "pop", "rock"]


@pytest.mark.asyncio
async def test_list_distinct_values_key_signature_single_value():
    """key_signature is not a multi-value field — still works as plain DISTINCT."""
    t1 = await create_track("T1")
    t2 = await create_track("T2")
    await update_track(t1.id, {"key_signature": "C major"})
    await update_track(t2.id, {"key_signature": "D minor"})

    vals = await list_distinct_values("key_signature")
    assert vals == ["C major", "D minor"]
