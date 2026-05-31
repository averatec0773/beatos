"""Approve handler for set_license_tiers (2PC commit path)."""
import datetime as dt
import json

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app


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


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.mark.asyncio
async def test_approve_inserts_tiers(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
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

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200, res.text

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
async def test_approve_replaces_existing_tiers(client, db_path):
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
        tok = await create_token(
            conn,
            "set_license_tiers",
            {
                "track_id": 1,
                "tiers": [{"name": "NewOnly", "deliverables": [], "prices": {}}],
            },
        )

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT name FROM license_tier WHERE track_id=1"
        ) as cur:
            names = [r[0] for r in await cur.fetchall()]
    assert names == ["NewOnly"]


@pytest.mark.asyncio
async def test_approve_empty_clears_all(client, db_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO license_tier "
            "(track_id, position, name, deliverables, prices_json, created_at, updated_at) "
            "VALUES (1, 0, 'Old', '[]', '{}', ?, ?)",
            (now, now),
        )
        await conn.commit()
        tok = await create_token(
            conn, "set_license_tiers", {"track_id": 1, "tiers": []}
        )

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(*) FROM license_tier WHERE track_id=1"
        ) as cur:
            (n,) = await cur.fetchone()
    assert n == 0


@pytest.mark.asyncio
async def test_approve_persists_share(client, db_path):
    """Gap 1: the approve INSERT must carry the share value from the token
    payload into the database row."""
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
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

    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200, res.text

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT share FROM license_tier WHERE track_id=1"
        ) as cur:
            rows = await cur.fetchall()
    assert len(rows) == 1
    assert rows[0][0] == 30.0


@pytest.mark.asyncio
async def test_approve_404_when_track_vanished(client, db_path):
    """Token was issued against an existing track; track gets deleted before
    approval. The handler must surface RowVanishedError, which the route
    layer maps to a 409."""
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "set_license_tiers",
            {"track_id": 1, "tiers": [{"name": "MP3", "deliverables": [], "prices": {}}]},
        )
        await conn.execute("DELETE FROM track WHERE id=1")
        await conn.commit()

    res = await client.post(f"/api/tokens/{tok}/approve")
    # The two_phase framework maps RowVanishedError to 409.
    assert res.status_code == 409, res.text
