import datetime as dt

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        await conn.execute(
            "INSERT INTO track (id, title, bpm, genre, created_at, updated_at) "
            "VALUES (1, 'A', 140, '[\"Trap Rap\"]', ?, ?)",
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
async def test_export_track_netease(client):
    res = await client.get("/api/tracks/1/export?platform=netease")
    assert res.status_code == 200
    body = res.json()
    assert body["platform"] == "netease"
    genre = next(f for f in body["fields"] if f["key"] == "genre")
    assert genre["value"] == "陷阱说唱"


@pytest.mark.asyncio
async def test_export_unknown_platform_400(client):
    res = await client.get("/api/tracks/1/export?platform=myspace")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_list_platforms(client):
    res = await client.get("/api/export/platforms")
    assert res.status_code == 200
    assert "netease" in res.json()["platforms"]
