import pytest
from httpx import ASGITransport, AsyncClient
from beatos_http.app import create_app
from beatos_http.pro import pro_available


async def _client():
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


@pytest.mark.asyncio
async def test_validate_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    async with await _client() as c:
        r = await c.post("/api/publish/sessions/validate")
    assert r.status_code == 402


@pytest.mark.asyncio
async def test_login_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    async with await _client() as c:
        r = await c.post("/api/publish/login", json={"platform": "netease"})
    assert r.status_code == 402


@pytest.mark.asyncio
async def test_login_status_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    async with await _client() as c:
        r = await c.get("/api/publish/login/abc")
    assert r.status_code == 402


@pytest.mark.asyncio
async def test_jobs_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    async with await _client() as c:
        r = await c.get("/api/publish/jobs")
    assert r.status_code == 402


@pytest.mark.asyncio
async def test_jobs_not_shadowed_by_job_id_route():
    async with await _client() as c:
        r = await c.get("/api/publish/jobs")
    assert r.status_code != 404
