"""EPIC-D14-1: pure license-PDF renderer (no DB/network)."""
from __future__ import annotations

import datetime as dt

from beatos_core.models.license_tier import LicenseTier
from beatos_core.models.track import Track

from beatos_http.license_contract import render_license_pdf

_TS = dt.datetime(2026, 1, 1, 12, 0, 0)


def _track() -> Track:
    return Track(id=1, title="Midnight Drive", producer=["AVERATEC"], created_at=_TS, updated_at=_TS)


def _tier(name: str = "WAV Lease", deliverables=("wav", "mp3"), prices=None) -> LicenseTier:
    return LicenseTier(
        id=1,
        track_id=1,
        name=name,
        deliverables=list(deliverables),
        prices={"CNY": 188.0} if prices is None else prices,
        created_at=_TS,
        updated_at=_TS,
    )


def test_renders_pdf_bytes_en():
    pdf = render_license_pdf(track=_track(), tier=_tier(), buyer="DJ Example", lang="en")
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_renders_pdf_bytes_zh_cjk():
    # zh exercises reportlab's bundled CJK font path — must not raise + produce a PDF.
    pdf = render_license_pdf(
        track=_track(), tier=_tier(name="独占授权"), buyer="买家甲", exclusive=True, lang="zh"
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_exclusive_unpriced_and_overrides():
    # Unpriced tier + explicit price/date override, exclusive clause path.
    pdf = render_license_pdf(
        track=_track(),
        tier=_tier(prices={}),
        buyer="Buyer",
        exclusive=True,
        price="USD 300",
        date="2026-06-24",
        lang="en",
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_unknown_lang_falls_back_to_english():
    pdf = render_license_pdf(track=_track(), tier=_tier(), buyer="X", lang="fr")
    assert pdf[:4] == b"%PDF"
