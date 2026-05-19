"""Approve handlers for create_tracks + attach_asset."""
import datetime as dt

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
            "INSERT INTO track (id, title, created_at, updated_at) VALUES (1, 'Existing', ?, ?)",
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
async def test_approve_create_tracks_inserts_rows(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "create_tracks",
            {
                "items": [
                    {"title": "Beat A", "bpm": 140, "producer": ["X"]},
                    {"title": "Beat B"},
                ],
                "preview": {"headline": "Create 2", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert len(body["created_ids"]) == 2
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT title, bpm, producer FROM track WHERE id IN ({}) ORDER BY id".format(
                ",".join(str(i) for i in body["created_ids"])
            )
        ) as cur:
            rows = await cur.fetchall()
    titles = [r[0] for r in rows]
    assert "Beat A" in titles and "Beat B" in titles


@pytest.mark.asyncio
async def test_approve_attach_asset_inserts(client, db_path, tmp_path):
    audio = tmp_path / "b.wav"
    audio.write_bytes(b"x")
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(
            conn,
            "attach_asset",
            {
                "track_id": 1,
                "role": "audio",
                "path": str(audio),
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["replaced"] is False
    assert isinstance(body["asset_id"], int)
    # Confirm DB row carries metadata, not just the asset_id
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT size_bytes, mime FROM asset WHERE id=?", (body["asset_id"],)
        ) as cur:
            row = await cur.fetchone()
    assert row[0] > 0  # size_bytes
    assert row[1] is not None and "audio" in row[1].lower()  # mime e.g. "audio/x-wav"


@pytest.mark.asyncio
async def test_approve_attach_asset_replace(client, db_path, tmp_path):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT INTO asset (track_id, role, abs_path, created_at, updated_at) "
            "VALUES (1, 'audio', '/old.wav', ?, ?)",
            (now, now),
        )
        new = tmp_path / "n.wav"
        new.write_bytes(b"x")
        tok = await create_token(
            conn,
            "attach_asset",
            {
                "track_id": 1,
                "role": "audio",
                "path": str(new),
                "preview": {"headline": "x", "sample": [], "warnings": []},
            },
        )
        await conn.commit()
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200
    body = res.json()
    assert body["replaced"] is True
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT abs_path FROM asset WHERE track_id=1 AND role='audio'"
        ) as cur:
            assert (await cur.fetchone())[0] == str(new)
