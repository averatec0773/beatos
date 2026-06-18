"""Local /api hardening — the BEATOS_API_TOKEN guard on agent-control endpoints
(B-H2) and the Electron-mode /api/fs disable switch (B-H3).

Threat model: in the packaged Electron app, CORS allows the file:// ("null")
origin, so a local .html the user opens could flip agent_permission_mode (e.g. to
disable read-only mode) or read the disk via /api/fs. The token (delivered to the
renderer through the preload bridge, which a file:// page lacks) and the fs switch
close that hole. Both are no-ops in web mode (token unset; fs still served).
"""
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
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
        "/api/app_settings/agent_permission_mode", json={"value": "read_only"}
    )
    assert res.status_code == 401
    # Correct token → allowed.
    res = await client.put(
        "/api/app_settings/agent_permission_mode",
        json={"value": "read_only"},
        headers=AUTH,
    )
    assert res.status_code == 200
    # Wrong token → 401.
    res = await client.put(
        "/api/app_settings/agent_permission_mode",
        json={"value": "enabled"},
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
        "/api/app_settings/agent_permission_mode", json={"value": "read_only"}
    )
    assert res.status_code == 200


# --- B-H3: /api/fs disabled in Electron mode ---


def _all_paths(routes) -> set[str]:
    # Version-robust route-path collector. FastAPI 0.137+ no longer flattens
    # include_router routes into app.routes; it wraps them in an _IncludedRouter
    # whose real routes live on `.original_router`. Older versions expose each
    # route's `.path` directly (or nested under `.routes`). Handle all shapes.
    paths: set[str] = set()
    for r in routes:
        p = getattr(r, "path", None)
        if isinstance(p, str):
            paths.add(p)
        nested = getattr(r, "routes", None)
        if nested and not callable(nested):
            paths |= _all_paths(nested)
        orig = getattr(r, "original_router", None)
        if orig is not None and hasattr(orig, "routes"):
            paths |= _all_paths(orig.routes)
    return paths


def test_fs_routes_absent_when_disabled(monkeypatch):
    monkeypatch.setenv("BEATOS_DISABLE_FS_API", "1")
    app = create_app()
    paths = _all_paths(app.routes)
    assert "/api/fs/list" not in paths
    assert "/api/fs/download" not in paths
    assert "/api/fs/open" not in paths


def test_fs_routes_present_by_default(monkeypatch):
    monkeypatch.delenv("BEATOS_DISABLE_FS_API", raising=False)
    app = create_app()
    paths = _all_paths(app.routes)
    assert "/api/fs/list" in paths
