"""Pro-gated publish MCP tools: discovery + publish_track under the permission
policy. Skipped in the free build (no beatos-publish). Browser-touching engine
calls (validate_session, run_job) are mocked — no live platform, no chromium.
"""
from __future__ import annotations

import json

import aiosqlite
import pytest

from beatos_mcp.pro import pro_available

pytestmark = pytest.mark.skipif(
    not pro_available(), reason="requires the beatos-publish (Pro) engine"
)

# Importing the server under Pro registers the publish_* tools; importing
# routes.tokens registers the publish_track apply handler.
import beatos_http.routes.tokens  # noqa: E402, F401
from beatos_core.app_settings.service import set_setting  # noqa: E402


async def _fetch_payload(db, token):
    async with aiosqlite.connect(db) as conn:
        async with conn.execute(
            "SELECT payload FROM tokens WHERE token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return json.loads(row[0])


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
        await publish_track(track_id=1, platform="spotify")


@pytest.mark.asyncio
async def test_publish_track_confirm_returns_token(fresh_db):
    from beatos_mcp.server import publish_track

    res = await publish_track(track_id=7, platform="netease", audio_asset_id=3, dry_run=True)
    assert res["status"] == "awaiting_approval"
    payload = await _fetch_payload(fresh_db, res["token"])
    assert payload["request"]["track_id"] == 7
    assert payload["request"]["platform"] == "netease"
    assert payload["request"]["dry_run"] is True
    assert payload["preview"]["risk"] == "external"


@pytest.mark.asyncio
async def test_publish_track_auto_approve_starts_job(fresh_db, monkeypatch):
    import asyncio

    import beatos_publish.service as svc
    from beatos_mcp.server import publish_track

    started: dict = {}

    async def fake_run_job(job_id, req):
        started["job_id"] = job_id
        started["platform"] = req.platform

    monkeypatch.setattr(svc, "run_job", fake_run_job)
    await set_setting("agent_permission_mode", "auto_approve")

    res = await publish_track(track_id=9, platform="douyin", video_asset_id=4)
    assert res["status"] == "approved"
    assert res["result"]["job_id"]
    assert res["result"]["status"] == "started"
    # Token consumed (audit trail kept).
    async with aiosqlite.connect(fresh_db) as conn:
        async with conn.execute(
            "SELECT status FROM tokens WHERE token=?", (res["token"],)
        ) as cur:
            assert (await cur.fetchone())[0] == "consumed"
    # The fire-and-forget run_job task ran.
    await asyncio.sleep(0)
    assert started["platform"] == "douyin"
