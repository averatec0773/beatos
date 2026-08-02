"""Extension-publish ticket routes (2026-08-01 design, Phase 1 backend)."""
import datetime as dt

import pytest
from httpx import ASGITransport, AsyncClient

from beatos_http.app import create_app
from beatos_http.pro import pro_available


def _client(app=None):
    app = app or create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


# --- free build: everything 402s -------------------------------------------

@pytest.mark.asyncio
async def test_ticket_routes_gated_when_free():
    if pro_available():
        pytest.skip("pro present")
    async with _client() as c:
        assert (await c.get("/api/publish/tickets/pending")).status_code == 402
        assert (await c.post("/api/publish/tickets/x/claim")).status_code == 402
        assert (await c.post("/api/publish/tickets/x/report", json={})).status_code == 402
        assert (await c.get("/api/publish/tickets/x/assets/1/nonce")).status_code == 402


# --- pro build: full flow through the HTTP layer ----------------------------

# Deterministic bytes for the streaming round-trip assertion.
_ASSET_BYTES = bytes(range(256)) * 8  # 2048 bytes


@pytest.fixture
def ticket_env(monkeypatch, tmp_path):
    """Fresh registries + mocked catalog seams so staging/claiming touches no
    DB and no browser (same seam style as test_publish_route). The mocked asset
    points at a REAL file under tmp_path (tests that need it request tmp_path
    themselves — pytest caches the same dir per test) so the streaming route
    can serve actual bytes."""
    if not pro_available():
        pytest.skip("pro engine absent; ticket routes 402 before logic")
    import beatos_publish.jobs as jobs_mod
    import beatos_publish.service as service_mod
    import beatos_publish.tickets as tickets_mod
    from beatos_core.export.models import ExportField, ExportResult
    from beatos_core.models.asset import Asset
    from beatos_publish.jobs import JobRegistry

    monkeypatch.delenv("BEATOS_DB_PATH", raising=False)
    reg = JobRegistry()
    monkeypatch.setattr(jobs_mod, "REGISTRY", reg)
    monkeypatch.setattr(tickets_mod, "REGISTRY", reg)
    tickets_mod._reset_reports()

    asset_file = tmp_path / "beat.mp3"
    asset_file.write_bytes(_ASSET_BYTES)

    async def _export(_track_id, platform):
        return ExportResult(platform=platform, fields=[
            ExportField(key="title", label="Title", value="My Beat"),
        ])

    async def _get_asset(asset_id):
        if asset_id != 5:
            return None
        return Asset(
            id=5, track_id=1, role="audio_tagged", format="mp3",
            abs_path=str(asset_file), size_bytes=2048,
            created_at=dt.datetime.now(dt.timezone.utc),
        )

    monkeypatch.setattr(service_mod, "export_metadata", _export)
    monkeypatch.setattr(service_mod, "get_asset", _get_asset)
    yield reg
    tickets_mod._reset_reports()


_STAGE_BODY = {
    "track_id": 1, "platform": "beatstars", "audio_asset_id": 5,
    "mode": "extension",
}


@pytest.mark.asyncio
async def test_extension_mode_stages_without_browser_task(ticket_env, monkeypatch):
    """mode=extension returns a staged ticket — no engine run, no tracked task."""
    import beatos_http.publish_tasks as tasks_mod
    import beatos_publish.service as service_mod

    async def _boom(*_a, **_k):
        raise AssertionError("run_job must not be called in extension mode")

    tracked = []
    monkeypatch.setattr(service_mod, "run_job", _boom)
    monkeypatch.setattr(tasks_mod, "track", lambda job_id, task: tracked.append(job_id))

    async with _client() as c:
        r = await c.post("/api/publish", json=_STAGE_BODY)
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "extension"
    # The renderer's "open the platform page" affordance (design §4 step 1).
    assert body["upload_url"].startswith("https://")
    job = ticket_env.get(body["job_id"])
    assert job.stage.value == "staged"
    assert job.request.mode == "extension"
    assert tracked == []


@pytest.mark.asyncio
async def test_extension_mode_resolution_failure_400(ticket_env):
    async with _client() as c:
        r = await c.post("/api/publish", json={**_STAGE_BODY, "audio_asset_id": 999})
    assert r.status_code == 400
    assert "asset 999" in r.json()["detail"]


@pytest.mark.asyncio
async def test_pending_claim_report_flow_with_token(ticket_env, monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", "tkn")
    auth = {"Authorization": "Bearer tkn"}
    async with _client() as c:
        r = await c.post("/api/publish", json=_STAGE_BODY, headers=auth)
        job_id = r.json()["job_id"]

        # Pending is an open read (panel polling) — no token needed.
        r = await c.get("/api/publish/tickets/pending")
        assert r.status_code == 200
        tickets = r.json()["tickets"]
        assert [t["job_id"] for t in tickets] == [job_id]
        assert tickets[0]["stage"] == "staged"
        assert tickets[0]["upload_url"].startswith("https://")
        assert tickets[0]["match"]

        # Platform filter.
        r = await c.get("/api/publish/tickets/pending", params={"platform": "netease"})
        assert r.json()["tickets"] == []

        # Claim → fill bundle.
        r = await c.post(f"/api/publish/tickets/{job_id}/claim", headers=auth)
        assert r.status_code == 200
        bundle = r.json()
        assert bundle["job_id"] == job_id
        assert bundle["fields"] == {"title": "My Beat"}
        assert "uploadUrl" in bundle["recipe"]
        asset_url = bundle["assets"][0].pop("url")
        assert asset_url.startswith(f"/api/publish/tickets/{job_id}/assets/5/")
        assert bundle["assets"] == [{
            "id": 5, "role": "audio", "format": "mp3",
            "name": "beat.mp3", "size_bytes": 2048,
        }]

        # Claimed tickets stay pending (reloaded panel re-attaches).
        r = await c.get("/api/publish/tickets/pending")
        assert r.json()["tickets"][0]["stage"] == "claimed"

        # Re-claim is idempotent.
        assert (await c.post(f"/api/publish/tickets/{job_id}/claim", headers=auth)).status_code == 200

        # Report a stage + field reports.
        r = await c.post(
            f"/api/publish/tickets/{job_id}/report",
            json={"stage": "filling_metadata", "message": "filling",
                  "reports": [{"page": "upload", "field_id": "title", "status": "ok"}]},
            headers=auth,
        )
        assert r.status_code == 200 and r.json() == {"ok": True}

        # Status includes the merged field reports for extension jobs.
        r = await c.get(f"/api/publish/{job_id}")
        assert r.status_code == 200
        status = r.json()
        assert status["stage"] == "filling_metadata"
        assert status["message"] == "filling"
        assert status["field_reports"] == [
            {"page": "upload", "field_id": "title", "status": "ok"},
        ]

        # Terminal failure via report.
        r = await c.post(
            f"/api/publish/tickets/{job_id}/report",
            json={"stage": "failed", "message": "selector missing"},
            headers=auth,
        )
        assert r.status_code == 200
        status = (await c.get(f"/api/publish/{job_id}")).json()
        assert status["stage"] == "failed"
        assert status["result"]["error"] == "selector missing"

        # A failed ticket is no longer pending nor claimable.
        assert (await c.get("/api/publish/tickets/pending")).json()["tickets"] == []
        assert (await c.post(f"/api/publish/tickets/{job_id}/claim", headers=auth)).status_code == 409


@pytest.mark.asyncio
async def test_claim_and_report_require_token(ticket_env, monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", "tkn")
    auth = {"Authorization": "Bearer tkn"}
    async with _client() as c:
        job_id = (await c.post("/api/publish", json=_STAGE_BODY, headers=auth)).json()["job_id"]
        # Missing / wrong token → 401 before any state changes.
        assert (await c.post(f"/api/publish/tickets/{job_id}/claim")).status_code == 401
        assert (
            await c.post(f"/api/publish/tickets/{job_id}/claim",
                         headers={"Authorization": "Bearer nope"})
        ).status_code == 401
        assert (
            await c.post(f"/api/publish/tickets/{job_id}/report", json={})
        ).status_code == 401
        assert ticket_env.get(job_id).stage.value == "staged"  # untouched


@pytest.mark.asyncio
async def test_claim_unknown_404_report_bad_stage_400(ticket_env):
    async with _client() as c:
        assert (await c.post("/api/publish/tickets/ghost/claim")).status_code == 404
        assert (await c.post("/api/publish/tickets/ghost/report", json={})).status_code == 404
        job_id = (await c.post("/api/publish", json=_STAGE_BODY)).json()["job_id"]
        r = await c.post(
            f"/api/publish/tickets/{job_id}/report", json={"stage": "submitting"}
        )
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_engine_job_status_has_no_field_reports(ticket_env):
    """Engine-mode jobs keep their response shape — no field_reports key."""
    from beatos_publish.models import PublishRequest
    job_id = ticket_env.create(PublishRequest(track_id=1, platform="beatstars"))
    async with _client() as c:
        status = (await c.get(f"/api/publish/{job_id}")).json()
    assert "field_reports" not in status


@pytest.mark.asyncio
async def test_tickets_pending_not_shadowed_by_job_id_route():
    async with _client() as c:
        r = await c.get("/api/publish/tickets/pending")
    assert r.status_code != 404


# --- asset streaming (capability URLs, design §5 ladder rung 1 + §8) --------


async def _staged_and_claimed(c) -> tuple[str, str]:
    """Stage + claim a ticket; returns (job_id, asset capability url)."""
    job_id = (await c.post("/api/publish", json=_STAGE_BODY)).json()["job_id"]
    bundle = (await c.post(f"/api/publish/tickets/{job_id}/claim")).json()
    return job_id, bundle["assets"][0]["url"]


@pytest.mark.asyncio
async def test_asset_stream_happy_path(ticket_env, tmp_path):
    async with _client() as c:
        _job_id, url = await _staged_and_claimed(c)
        r = await c.get(url)
        assert r.status_code == 200
        # Byte round-trip from the real tmp file, correct type + length, and
        # CORS open on THIS route only (page scripts fetch it cross-origin).
        assert r.content == (tmp_path / "beat.mp3").read_bytes()
        assert r.headers["content-type"] == "audio/mpeg"
        assert int(r.headers["content-length"]) == 2048
        assert r.headers["access-control-allow-origin"] == "*"
        # No preflight needed for a simple GET, but OPTIONS answers anyway.
        r = await c.options(url)
        assert r.status_code == 204
        assert r.headers["access-control-allow-origin"] == "*"


@pytest.mark.asyncio
async def test_asset_stream_404s(ticket_env):
    async with _client() as c:
        job_id, url = await _staged_and_claimed(c)
        nonce = url.rsplit("/", 1)[1]
        # Nonce mismatch, unknown asset, unknown job — all plain 404s.
        r = await c.get(f"/api/publish/tickets/{job_id}/assets/5/wrong-nonce")
        assert r.status_code == 404
        assert r.headers["access-control-allow-origin"] == "*"
        assert (await c.get(f"/api/publish/tickets/{job_id}/assets/999/{nonce}")).status_code == 404
        assert (await c.get(f"/api/publish/tickets/ghost/assets/5/{nonce}")).status_code == 404
        # Unclaimed ticket has no nonces yet either.
        fresh = (await c.post("/api/publish", json=_STAGE_BODY)).json()["job_id"]
        assert (await c.get(f"/api/publish/tickets/{fresh}/assets/5/{nonce}")).status_code == 404


@pytest.mark.asyncio
async def test_asset_stream_missing_file_404_with_detail(ticket_env, tmp_path):
    """A catalog row whose bytes are gone (unmounted drive) must name the file,
    not stream garbage or 500."""
    async with _client() as c:
        _job_id, url = await _staged_and_claimed(c)
        (tmp_path / "beat.mp3").unlink()
        r = await c.get(url)
        assert r.status_code == 404
        assert "beat.mp3" in r.json()["detail"]
        assert "missing on disk" in r.json()["detail"]


@pytest.mark.asyncio
async def test_asset_stream_410_when_terminal(ticket_env):
    async with _client() as c:
        job_id, url = await _staged_and_claimed(c)
        r = await c.post(
            f"/api/publish/tickets/{job_id}/report",
            json={"stage": "failed", "message": "dead"},
        )
        assert r.status_code == 200
        r = await c.get(url)
        assert r.status_code == 410
        assert r.headers["access-control-allow-origin"] == "*"


@pytest.mark.asyncio
async def test_asset_nonce_regenerated_on_reclaim(ticket_env):
    async with _client() as c:
        job_id, first_url = await _staged_and_claimed(c)
        bundle = (await c.post(f"/api/publish/tickets/{job_id}/claim")).json()
        second_url = bundle["assets"][0]["url"]
        assert second_url != first_url
        assert (await c.get(first_url)).status_code == 404  # old claim's link is dead
        assert (await c.get(second_url)).status_code == 200


@pytest.mark.asyncio
async def test_asset_nonces_invalidated_on_job_delete(ticket_env, monkeypatch):
    monkeypatch.setenv("BEATOS_API_TOKEN", "tkn")
    auth = {"Authorization": "Bearer tkn"}
    async with _client() as c:
        job_id = (await c.post("/api/publish", json=_STAGE_BODY, headers=auth)).json()["job_id"]
        bundle = (await c.post(f"/api/publish/tickets/{job_id}/claim", headers=auth)).json()
        url = bundle["assets"][0]["url"]
        assert (await c.delete(f"/api/publish/{job_id}", headers=auth)).status_code == 204
        from beatos_publish.tickets import TICKET_ASSETS
        assert job_id not in TICKET_ASSETS
        assert (await c.get(url)).status_code == 404  # job row gone → 404, not 410
