"""Direct-apply handler for set_license_tiers."""
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
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1, 'Beat', ?, ?)",
            (now, now),
        )
        await conn.commit()
    return p


@pytest.mark.asyncio
async def test_apply_inserts_tiers(db_path):
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "set_license_tiers",
            {
                "track_id": 1,
                "tiers": [
                    {
                        "name": "MP3",
                        "deliverables": ["mp3"],
                        "prices": {"CNY": 50.0},
                        "notes": None,
                    },
                    {
                        "name": "WAV+Stems",
                        "deliverables": ["mp3", "wav", "stem"],
                        "prices": {"CNY": 3500.0, "USD": 500.0},
                        "notes": "exclusive",
                    },
                ],
            },
        )
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT position, name, deliverables, prices_json, notes "
            "FROM license_tier WHERE track_id=1 ORDER BY position"
        ) as cur:
            rows = await cur.fetchall()
    assert len(rows) == 2
    assert rows[0][1] == "MP3"
    assert json.loads(rows[0][2]) == ["mp3"]
    assert json.loads(rows[0][3]) == {"CNY": 50.0}
    assert rows[1][1] == "WAV+Stems"
    assert json.loads(rows[1][3]) == {"CNY": 3500.0, "USD": 500.0}
    assert rows[1][4] == "exclusive"


@pytest.mark.asyncio
async def test_apply_replaces_existing_tiers(db_path):
    # Seed an old tier directly so the handler must clear it.
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO license_tier "
            "(track_id, position, name, deliverables, prices_json, created_at, updated_at) "
            "VALUES (1, 0, 'OldTier', '[]', '{}', ?, ?)",
            (now, now),
        )
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "set_license_tiers",
            {
                "track_id": 1,
                "tiers": [{"name": "NewOnly", "deliverables": [], "prices": {}}],
            },
        )
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name FROM license_tier WHERE track_id=1"
        ) as cur:
            names = [r[0] for r in await cur.fetchall()]
    assert names == ["NewOnly"]


@pytest.mark.asyncio
async def test_apply_empty_clears_all(db_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO license_tier "
            "(track_id, position, name, deliverables, prices_json, created_at, updated_at) "
            "VALUES (1, 0, 'Old', '[]', '{}', ?, ?)",
            (now, now),
        )
        await conn.commit()
    async with aiosqlite.connect(db_path) as conn:
        await apply(conn, "set_license_tiers", {"track_id": 1, "tiers": []})
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM license_tier WHERE track_id=1"
        ) as cur:
            (n,) = await cur.fetchone()
    assert n == 0


@pytest.mark.asyncio
async def test_apply_persists_share(db_path):
    """Gap 1: the INSERT must carry the share value from the payload into the
    database row."""
    async with aiosqlite.connect(db_path) as conn:
        await apply(
            conn,
            "set_license_tiers",
            {
                "track_id": 1,
                "tiers": [
                    {
                        "name": "MP3",
                        "deliverables": ["mp3"],
                        "prices": {"CNY": 50.0},
                        "notes": None,
                        "share": 30.0,
                    }
                ],
            },
        )
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT share FROM license_tier WHERE track_id=1"
        ) as cur:
            rows = await cur.fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 30.0


@pytest.mark.asyncio
async def test_apply_raises_when_track_vanished(db_path):
    """Track gets deleted before apply runs. The handler must surface
    RowVanishedError (the chokepoint rolls back and records a failed action)."""
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute("DELETE FROM track WHERE id=1")
        await conn.commit()

    async with aiosqlite.connect(db_path) as conn:
        with pytest.raises(RowVanishedError):
            await apply(
                conn,
                "set_license_tiers",
                {"track_id": 1, "tiers": [{"name": "MP3", "deliverables": [], "prices": {}}]},
            )
        await conn.rollback()
