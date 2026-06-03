import pytest
from httpx import ASGITransport, AsyncClient
from beatos_http.app import create_app


@pytest.mark.asyncio
async def test_pro_status_reports_publish_flag():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/pro/status")
    assert r.status_code == 200
    body = r.json()
    assert "publish" in body and isinstance(body["publish"], bool)


@pytest.mark.asyncio
async def test_pro_status_false_in_free_build():
    from beatos_http.pro import pro_available
    # On the public branch with no pro submodule mounted, the engine is absent.
    if pro_available():
        pytest.skip("pro engine present (submodule mounted)")
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/pro/status")
    assert r.json()["publish"] is False
