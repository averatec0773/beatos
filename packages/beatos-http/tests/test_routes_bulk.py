import datetime as dt

import aiosqlite
import pytest
from httpx import ASGITransport, AsyncClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app


@pytest.fixture
async def client(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    await run_migrations(p)
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    async with aiosqlite.connect(p) as conn:
        for tid in (1, 2):
            await conn.execute(
                "INSERT INTO track (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (tid, f"T{tid}", now, now),
            )
        await conn.commit()
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.mark.asyncio
async def test_bulk_update_adds_genre(client):
    res = await client.post(
        "/api/tracks/bulk-update",
        json={"ids": [1, 2], "patch": {"genre": {"add": ["Trap Rap"]}}},
    )
    assert res.status_code == 200
    assert res.json()["updated_count"] == 2


@pytest.mark.asyncio
async def test_bulk_apply_license_template_without_default_400(client):
    res = await client.post("/api/tracks/bulk-apply-license-template", json={"ids": [1]})
    assert res.status_code == 400
