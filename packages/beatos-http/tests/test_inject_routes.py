import datetime as dt
import socket

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app, create_inject_app, _try_bind_fixed
from beatos_http.routes import inject


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
    inject._reset_slot()
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c
    inject._reset_slot()


@pytest.mark.asyncio
async def test_pending_empty_initially(client):
    res = await client.get("/api/inject/pending")
    assert res.status_code == 200
    assert res.json() == {"staged": False}


@pytest.mark.asyncio
async def test_stage_then_pending_returns_resolved_export(client):
    res = await client.post("/api/inject/stage", json={"track_id": 1, "platform": "netease"})
    assert res.status_code == 200 and res.json()["ok"] is True

    res = await client.get("/api/inject/pending")
    body = res.json()
    assert body["staged"] is True
    assert body["platform"] == "netease"
    genre = next(f for f in body["export"]["fields"] if f["key"] == "genre")
    assert genre["value"] == "陷阱说唱"


@pytest.mark.asyncio
async def test_pending_consumes_on_read(client):
    await client.post("/api/inject/stage", json={"track_id": 1, "platform": "netease"})
    first = await client.get("/api/inject/pending")
    assert first.json()["staged"] is True
    second = await client.get("/api/inject/pending")
    assert second.json() == {"staged": False}


@pytest.mark.asyncio
async def test_stage_overwrites_single_slot(client):
    await client.post("/api/inject/stage", json={"track_id": 1, "platform": "netease"})
    await client.post("/api/inject/stage", json={"track_id": 1, "platform": "netease"})
    assert (await client.get("/api/inject/pending")).json()["staged"] is True
    assert (await client.get("/api/inject/pending")).json() == {"staged": False}


@pytest.mark.asyncio
async def test_pending_platform_filter_mismatch(client):
    await client.post("/api/inject/stage", json={"track_id": 1, "platform": "netease"})
    res = await client.get("/api/inject/pending?platform=spotify")
    assert res.json() == {"staged": False}
    assert (await client.get("/api/inject/pending?platform=netease")).json()["staged"] is True


@pytest.mark.asyncio
async def test_stage_unknown_track_400(client):
    res = await client.post("/api/inject/stage", json={"track_id": 999, "platform": "netease"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_stage_unknown_platform_400(client):
    res = await client.post("/api/inject/stage", json={"track_id": 1, "platform": "myspace"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_form_map_returns_empty(client):
    # Recipes are private; the legacy endpoint returns {} for all platforms.
    res = await client.get("/api/inject/form-map/netease")
    assert res.status_code == 200
    assert res.json() == {}


@pytest.mark.asyncio
async def test_form_map_unknown_also_empty(client):
    res = await client.get("/api/inject/form-map/myspace")
    assert res.status_code == 200
    assert res.json() == {}


@pytest.mark.asyncio
async def test_ping(client):
    res = await client.get("/api/inject/ping")
    assert res.json() == {"beatos_inject": True}


@pytest.mark.asyncio
async def test_inject_app_serves_ping_and_formmap():
    app = create_inject_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        assert (await c.get("/api/inject/ping")).json() == {"beatos_inject": True}
        res = await c.get("/api/inject/form-map/netease")
        assert res.status_code == 200
        assert res.json() == {}


def test_inject_app_has_no_mcp_mount():
    app = create_inject_app()
    paths = {r.path for r in app.routes}
    assert "/mcp" not in paths
    assert "/api/inject/pending" in paths
    assert "/api/inject/stage" not in paths


def test_try_bind_fixed_returns_socket_then_none():
    s1 = _try_bind_fixed(0)  # port 0 = OS picks a free port, always binds
    assert s1 is not None
    bound_port = s1.getsockname()[1]
    # The real "port in use" case is a server LISTENING on it. Without listen(),
    # SO_REUSEADDR lets the second bind succeed on Linux (but not macOS) — so the
    # test must listen to be portable and to mirror how the inject app holds 48923.
    s1.listen()
    try:
        s2 = _try_bind_fixed(bound_port)  # listening -> EADDRINUSE -> None
        assert s2 is None
    finally:
        s1.close()
