"""Pro-gated publish MCP tools: discovery + publish_track under the L1 model.
Skipped in the free build (no beatos-publish). Browser-touching engine calls
(validate_session, run_job) are mocked — no live platform, no chromium.
"""
from __future__ import annotations

import asyncio

import pytest

from beatos_mcp.pro import pro_available

pytestmark = pytest.mark.skipif(
    not pro_available(), reason="requires the beatos-publish (Pro) engine"
)

# Importing the handlers registers the publish_track apply handler.
import beatos_http.handlers  # noqa: E402, F401


@pytest.mark.asyncio
async def test_list_publish_platforms(fresh_db):
    from beatos_mcp.server import list_publish_platforms

    res = await list_publish_platforms()
    assert "netease" in res["platforms"]
    assert "douyin" in res["platforms"]


@pytest.mark.asyncio
async def test_publish_session_status_mocked(fresh_db, monkeypatch):
    import beatos_publish.service as svc
    from beatos_mcp.server import publish_session_status

    async def fake_validate(platform, account="default"):
        return "valid" if platform == "netease" else "not_logged_in"

    monkeypatch.setattr(svc, "validate_session", fake_validate)
    res = await publish_session_status(platform="netease")
    assert res["sessions"]["netease"] == "valid"


@pytest.mark.asyncio
async def test_list_publish_jobs_shape(fresh_db):
    from beatos_mcp.server import list_publish_jobs

    res = await list_publish_jobs()
    assert isinstance(res["jobs"], list)


@pytest.mark.asyncio
async def test_publish_track_unknown_platform(fresh_db):
    from beatos_mcp.server import publish_track

    with pytest.raises(ValueError, match="unknown platform"):
        await publish_track(track_id=1, platform="spotify", dry_run=False)


@pytest.mark.asyncio
async def test_publish_track_dry_run_default_rehearses(fresh_db, monkeypatch):
    """Default call (no dry_run) must NOT submit — the engine gets dry_run=True."""
    import beatos_publish.service as svc
    from beatos_mcp.server import publish_track

    captured: dict = {}

    async def fake_run_job(job_id, req):
        captured["dry_run"] = req.dry_run
        captured["platform"] = req.platform

    monkeypatch.setattr(svc, "run_job", fake_run_job)
    res = await publish_track(track_id=7, platform="netease", audio_asset_id=3)
    assert res["status"] == "applied"
    assert res["result"]["job_id"]
    await asyncio.sleep(0)  # let the fire-and-forget run_job task run
    assert captured["dry_run"] is True  # default is a safe rehearsal


@pytest.mark.asyncio
async def test_publish_track_explicit_real_publish(fresh_db, monkeypatch):
    """dry_run=false is the deliberate-confirm gate: the engine really submits."""
    import beatos_publish.service as svc
    from beatos_mcp.server import publish_track

    captured: dict = {}

    async def fake_run_job(job_id, req):
        captured["dry_run"] = req.dry_run

    monkeypatch.setattr(svc, "run_job", fake_run_job)
    res = await publish_track(
        track_id=9, platform="douyin", video_asset_id=4, dry_run=False
    )
    assert res["status"] == "applied"
    assert res["result"]["status"] == "started"
    await asyncio.sleep(0)
    assert captured["dry_run"] is False
