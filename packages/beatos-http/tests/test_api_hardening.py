"""Local /api hardening — the BEATOS_API_TOKEN guard on agent-control endpoints
(B-H2) and the Electron-mode /api/fs disable switch (B-H3).

Threat model: in the packaged Electron app, CORS allows the file:// ("null")
origin, so a local .html the user opens could flip agent_permission_mode, approve
pending write tokens, or read the disk via /api/fs. The token (delivered to the
renderer through the preload bridge, which a file:// page lacks) and the fs switch
close that hole. Both are no-ops in web mode (token unset; fs still served).
"""
import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_core.two_phase import create_token
from beatos_http.app import create_app

TOKEN = "test-local-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
async def db_path(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


@pytest.fixture
async def client(db_path):
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


# --- B-H2: token guard on agent-control endpoints ---


@pytest.mark.asyncio
async def test_sensitive_setting_write_requires_token_when_configured(
    client, monkeypatch
):
    monkeypatch.setenv("BEATOS_API_TOKEN", TOKEN)
    # No Authorization header → 401.
    res = await client.put(
        "/api/app_settings/agent_permission_mode", json={"value": "auto_approve"}
    )
    assert res.status_code == 401
    # Correct token → allowed.
    res = await client.put(
        "/api/app_settings/agent_permission_mode",
        json={"value": "auto_approve"},
        headers=AUTH,
    )
    assert res.status_code == 200
    # Wrong token → 401.
    res = await client.put(
        "/api/app_settings/agent_permission_mode",
        json={"value": "confirm"},
        headers={"Authorization": "Bearer nope"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_non_sensitive_setting_write_is_not_gated(client, monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", TOKEN)
    res = await client.put("/api/app_settings/app_language", json={"value": "zh"})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_sensitive_setting_write_open_when_token_unset(client):
    # Web mode: no token configured → same-origin CORS is the guard, endpoint open.
    res = await client.put(
        "/api/app_settings/agent_permission_mode", json={"value": "auto_approve"}
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_token_approve_requires_token_when_configured(client, monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", TOKEN)
    # Guard fires before the token lookup: unauthenticated → 401, not 404.
    res = await client.post("/api/tokens/whatever/approve")
    assert res.status_code == 401
    res = await client.post("/api/tokens/whatever/reject")
    assert res.status_code == 401
    # Authenticated request passes the guard and reaches the 404 (no such token).
    res = await client.post("/api/tokens/whatever/approve", headers=AUTH)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_token_approve_open_when_token_unset(client, db_path):
    async with aiosqlite.connect(db_path) as conn:
        tok = await create_token(conn, "create_list", {"name": "New"})
        await conn.commit()
    # No token configured → approval works without an Authorization header.
    res = await client.post(f"/api/tokens/{tok}/approve")
    assert res.status_code == 200


# --- B-H3: /api/fs disabled in Electron mode ---


def test_fs_routes_absent_when_disabled(monkeypatch):
    monkeypatch.setenv("BEATOS_DISABLE_FS_API", "1")
    app = create_app()
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/fs/list" not in paths
    assert "/api/fs/download" not in paths
    assert "/api/fs/open" not in paths


def test_fs_routes_present_by_default(monkeypatch):
    monkeypatch.delenv("BEATOS_DISABLE_FS_API", raising=False)
    app = create_app()
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/fs/list" in paths
