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


# --- P20: mutating publish routes are token-gated (the gate runs BEFORE the pro
# check, so these assertions hold in both free and pro builds) ------------------

@pytest.mark.asyncio
async def test_mutating_publish_routes_require_token(monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", "secret-abc")
    async with await _client() as c:
        # No Authorization header → 401 before anything else runs.
        assert (await c.post("/api/publish", json={"track_id": 1, "platform": "netease"})).status_code == 401
        assert (await c.post("/api/publish/login", json={"platform": "netease"})).status_code == 401
        assert (await c.delete("/api/publish/jobs")).status_code == 401
        assert (await c.delete("/api/publish/xyz")).status_code == 401


@pytest.mark.asyncio
async def test_wrong_token_rejected(monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", "secret-abc")
    async with await _client() as c:
        r = await c.delete("/api/publish/jobs", headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_correct_token_passes_the_gate(monkeypatch):
    """With the right token the gate is cleared — the request proceeds to the
    pro check (402 free / not-401 with pro). It must NOT 401."""
    monkeypatch.setenv("BEATOS_API_TOKEN", "secret-abc")
    async with await _client() as c:
        r = await c.delete("/api/publish/jobs", headers={"Authorization": "Bearer secret-abc"})
    assert r.status_code != 401


@pytest.mark.asyncio
async def test_read_routes_not_token_gated(monkeypatch):
    """GET stays open (badge polling) even with a token configured."""
    monkeypatch.setenv("BEATOS_API_TOKEN", "secret-abc")
    async with await _client() as c:
        r = await c.get("/api/publish/jobs")
    assert r.status_code != 401
