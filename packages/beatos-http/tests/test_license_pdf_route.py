"""EPIC-D14-2: POST /api/tracks/{id}/license-pdf route."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from beatos_core.db import run_migrations
from beatos_core.licenses.service import create_tier
from beatos_core.tracks.service import create_track

from beatos_http.routes.license_pdf import _LicenseRequest, license_pdf


@pytest.fixture
def db(tmp_path, monkeypatch):
    p = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(p))
    return p


async def test_track_not_found_404(db):
    await run_migrations(db)
    with pytest.raises(HTTPException) as ei:
        await license_pdf(99999, _LicenseRequest(tier_id=1, buyer="X"))
    assert ei.value.status_code == 404


async def test_blank_buyer_400(db):
    await run_migrations(db)
    t = await create_track("Beat A")
    tier = await create_tier(t.id, name="WAV", deliverables=["wav"], prices={"CNY": 188})
    with pytest.raises(HTTPException) as ei:
        await license_pdf(t.id, _LicenseRequest(tier_id=tier.id, buyer="   "))
    assert ei.value.status_code == 400


async def test_tier_mismatch_404(db):
    await run_migrations(db)
    a = await create_track("Beat A")
    b = await create_track("Beat B")
    tier_b = await create_tier(b.id, name="WAV", deliverables=["wav"])
    # tier belongs to track b, not a → 404
    with pytest.raises(HTTPException) as ei:
        await license_pdf(a.id, _LicenseRequest(tier_id=tier_b.id, buyer="DJ X"))
    assert ei.value.status_code == 404


async def test_returns_pdf_with_headers(db):
    await run_migrations(db)
    t = await create_track("Midnight Drive")
    tier = await create_tier(t.id, name="WAV Lease", deliverables=["wav", "mp3"], prices={"CNY": 188})

    resp = await license_pdf(
        t.id, _LicenseRequest(tier_id=tier.id, buyer="DJ Example", exclusive=True, lang="en")
    )
    assert resp.status_code == 200
    assert resp.media_type == "application/pdf"
    assert resp.body[:4] == b"%PDF"
    assert "attachment" in resp.headers["content-disposition"]


async def test_zh_lang_renders(db):
    await run_migrations(db)
    t = await create_track("午夜飞驰")
    tier = await create_tier(t.id, name="独占", deliverables=["wav", "stem"])
    resp = await license_pdf(t.id, _LicenseRequest(tier_id=tier.id, buyer="买家甲", lang="zh"))
    assert resp.status_code == 200
    assert resp.body[:4] == b"%PDF"
