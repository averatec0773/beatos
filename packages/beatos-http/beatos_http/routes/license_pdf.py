"""POST /api/tracks/{id}/license-pdf — generate a license contract PDF (EPIC-D14-2).

Fetches the Track + the chosen LicenseTier, renders a one-page PDF via the pure
renderer (license_contract.render_license_pdf), and streams it back as a download.
Works identically for desktop and web (plain HTTP — no Electron-only bits). FREE
feature (no Pro gating); publishing stays Pro.
"""
from __future__ import annotations

import urllib.parse
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from beatos_core.licenses.service import get_tier
from beatos_core.tracks.service import get_track

from beatos_http.license_contract import render_license_pdf

track_router = APIRouter(tags=["license"])


class _LicenseRequest(BaseModel):
    tier_id: int
    buyer: str
    exclusive: bool = False
    price: Optional[str] = None
    date: Optional[str] = None
    lang: str = "en"


def _content_disposition(track_title: str, tier_name: str) -> str:
    """attachment header with an ASCII fallback + UTF-8 name (RFC 5987)."""
    nice = f"{track_title} - {tier_name} license.pdf".strip()
    quoted = urllib.parse.quote(nice)
    return f"attachment; filename=\"license.pdf\"; filename*=UTF-8''{quoted}"


@track_router.post("/api/tracks/{track_id}/license-pdf")
async def license_pdf(track_id: int, req: _LicenseRequest) -> Response:
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(404, "Track not found")
    if not req.buyer.strip():
        raise HTTPException(400, "Buyer name is required")
    tier = await get_tier(req.tier_id)
    if tier is None or tier.track_id != track_id:
        raise HTTPException(404, "License tier not found for this track")

    pdf = render_license_pdf(
        track=track,
        tier=tier,
        buyer=req.buyer.strip(),
        exclusive=req.exclusive,
        price=req.price,
        date=req.date,
        lang=req.lang,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(track.title, tier.name)},
    )
