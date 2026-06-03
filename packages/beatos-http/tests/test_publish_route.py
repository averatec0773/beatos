import pytest
from httpx import ASGITransport, AsyncClient
from beatos_http.app import create_app
from beatos_http.pro import pro_available


@pytest.mark.asyncio
async def test_publish_requires_pro_when_engine_absent():
    if pro_available():
        pytest.skip("pro engine present; free-build assertion N/A")
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/api/publish", json={"track_id": 1, "platform": "netease", "audio_asset_id": 5})
    assert r.status_code == 402


@pytest.mark.asyncio
async def test_publish_status_unknown_job():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/publish/does-not-exist")
    # 402 when free (gated before lookup) or 404 when pro present
    assert r.status_code in (402, 404)


@pytest.mark.asyncio
async def test_publish_sessions_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/publish/sessions")
    assert r.status_code == 402
