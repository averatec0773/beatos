"""Direct-apply handlers for update_tracks + merge_metadata."""
import datetime as dt
import json

import aiosqlite
import pytest

import beatos_http.handlers  # noqa: F401 — registers the apply handlers
from beatos_core.approvals import RowVanishedError, apply
from beatos_core.db import run_migrations


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, bpm, key_signature, producer, genre, mood, created_at, updated_at) "
            "VALUES (1, 'A', 140, 'C', '[\"Smoke\"]', '[\"trap\"]', '[\"dark\"]', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, bpm, producer, created_at, updated_at) "
            "VALUES (2, 'B', 90, '[\"smoke\"]', ?, ?)",
            (now, now),
        )
        await conn.execute(
            "INSERT INTO track (id, title, producer, created_at, updated_at) "
            "VALUES (3, 'C', '[\"SMOKE\", \"other\"]', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


@pytest.mark.asyncio
async def test_update_tracks_scalar_bpm(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "update_tracks", {"ids": [1, 2], "patch": {"bpm": 200}})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id, bpm FROM track WHERE id IN (1,2,3) ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    assert rows == [(1, 200), (2, 200), (3, None)]


@pytest.mark.asyncio
async def test_update_tracks_key_maps_to_key_signature(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "update_tracks", {"ids": [1], "patch": {"key": "F#m"}})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT key_signature FROM track WHERE id=1") as cur:
            assert (await cur.fetchone())[0] == "F#m"


@pytest.mark.asyncio
async def test_update_tracks_producer_list_replace(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "update_tracks", {"ids": [1], "patch": {"producer": ["NewGuy"]}})
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT producer FROM track WHERE id=1") as cur:
            assert json.loads((await cur.fetchone())[0]) == ["NewGuy"]


@pytest.mark.asyncio
async def test_update_tracks_producer_add_remove(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "update_tracks",
            {"ids": [3], "patch": {"producer": {"add": ["X"], "remove": ["other"]}}},
        )
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT producer FROM track WHERE id=3") as cur:
            producers = json.loads((await cur.fetchone())[0])
    assert "SMOKE" in producers and "X" in producers and "other" not in producers


@pytest.mark.asyncio
async def test_update_tracks_rolls_back_when_id_vanished(db_path):
    async with aiosqlite.connect(db_path) as conn:
        with pytest.raises(RowVanishedError):
            await apply(conn, "update_tracks", {"ids": [1, 9999], "patch": {"bpm": 50}})
        await conn.rollback()
    # Track 1's bpm is unchanged
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT bpm FROM track WHERE id=1") as cur:
            assert (await cur.fetchone())[0] == 140


@pytest.mark.asyncio
async def test_update_tracks_add_and_remove_overlap_add_wins(db_path):
    """When the same value appears in both add and remove, add takes precedence
    (remove runs first, then add re-introduces). Pin this behavior so refactors
    can't silently flip it."""
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "update_tracks",
            {"ids": [1], "patch": {"producer": {"add": ["Smoke"], "remove": ["Smoke"]}}},
        )
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute("SELECT producer FROM track WHERE id=1") as cur:
            producers = json.loads((await cur.fetchone())[0])
    # Track 1 starts with ["Smoke"]. remove drops it, add restores it. Net: ["Smoke"].
    assert producers == ["Smoke"]


@pytest.mark.asyncio
async def test_merge_metadata_collapses_aliases(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "merge_metadata",
            {
                "field": "producer",
                "aliases": ["smoke", "SMOKE"],
                "to": "Smoke",
                "_affected_ids": [2, 3],
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT id, producer FROM track WHERE id IN (1,2,3) ORDER BY id"
        ) as cur:
            rows = await cur.fetchall()
    # id=1 already had 'Smoke' → unchanged
    assert json.loads(rows[0][1]) == ["Smoke"]
    # id=2 'smoke' → 'Smoke'; deduped to single entry
    assert json.loads(rows[1][1]) == ["Smoke"]
    # id=3 'SMOKE', 'other' → 'Smoke', 'other' (preserves other entries; dedups SMOKE→Smoke)
    p3 = json.loads(rows[2][1])
    assert "Smoke" in p3 and "other" in p3 and "SMOKE" not in p3
    assert p3.count("Smoke") == 1
