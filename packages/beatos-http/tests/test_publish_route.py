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


async def _capture_engine_request(monkeypatch):
    """Patch the lazily-imported engine seams so POST /api/publish builds an engine
    request without launching a browser, and return the captured PublishRequest."""
    import beatos_publish.jobs as jobs_mod
    import beatos_publish.platforms as platforms_mod
    import beatos_publish.service as service_mod

    captured = {}

    def _create(req):
        captured["req"] = req
        return "job-test"

    async def _run_job(_job_id, _req):
        return None

    monkeypatch.setattr(platforms_mod, "available", lambda: ["netease"])
    monkeypatch.setattr(jobs_mod.REGISTRY, "create", _create)
    monkeypatch.setattr(service_mod, "run_job", _run_job)
    return captured


@pytest.mark.asyncio
async def test_publish_auto_advance_defaults_off(monkeypatch):
    if not pro_available():
        pytest.skip("pro engine absent; route 402s before building the request")
    monkeypatch.delenv("BEATOS_PUBLISH_AUTO_ADVANCE", raising=False)
    captured = await _capture_engine_request(monkeypatch)

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(
            "/api/publish",
            json={"track_id": 1, "platform": "netease", "audio_asset_id": 5},
        )
    assert r.status_code == 200
    assert captured["req"].auto_advance is False


@pytest.mark.asyncio
async def test_publish_auto_advance_env_gates_it(monkeypatch):
    if not pro_available():
        pytest.skip("pro engine absent; route 402s before building the request")
    monkeypatch.setenv("BEATOS_PUBLISH_AUTO_ADVANCE", "1")
    captured = await _capture_engine_request(monkeypatch)

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(
            "/api/publish",
            json={"track_id": 1, "platform": "netease", "audio_asset_id": 5},
        )
    assert r.status_code == 200
    assert captured["req"].auto_advance is True


@pytest.mark.asyncio
async def test_publish_body_ignores_client_auto_advance(monkeypatch):
    """The public body no longer accepts auto_advance — a client that sends it
    cannot turn the flow on (env var stays the only switch)."""
    if not pro_available():
        pytest.skip("pro engine absent; route 402s before building the request")
    monkeypatch.delenv("BEATOS_PUBLISH_AUTO_ADVANCE", raising=False)
    captured = await _capture_engine_request(monkeypatch)

    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(
            "/api/publish",
            json={
                "track_id": 1,
                "platform": "netease",
                "audio_asset_id": 5,
                "auto_advance": True,
            },
        )
    assert r.status_code == 200
    assert captured["req"].auto_advance is False
