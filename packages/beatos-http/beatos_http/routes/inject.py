"""Inject staging — Phase 1 (human-triggered).

A single overwrite slot (module-level singleton) holds the most recently staged
upload payload. POST /stage resolves track+platform into an ExportResult and
stores it; GET /pending consumes-on-read (returns once, then empty); the form
selector map is served from beatos-platforms data.

Shared between the main API app (renderer POSTs /stage on the ephemeral port)
and the fixed-port inject app (the browser extension GETs /pending + /form-map).
Both apps include this router, so the slot below is the single shared state.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from beatos_core.export.service import export_metadata
from beatos_platforms import load_form_map

router = APIRouter(tags=["inject"])

# Overwrite-style single slot. Phase 1 holds one staged fill at a time.
_STAGED: dict | None = None


class StageRequest(BaseModel):
    track_id: int
    platform: str


@router.get("/api/inject/ping")
async def inject_ping() -> dict:
    """Liveness + identity marker so the extension confirms it's BeatOS."""
    return {"beatos_inject": True}


@router.post("/api/inject/stage")
async def stage_inject(req: StageRequest) -> dict:
    global _STAGED
    try:
        export = await export_metadata(req.track_id, req.platform)
    except ValueError as e:
        raise HTTPException(400, str(e))
    _STAGED = {"platform": req.platform, "export": export.model_dump()}
    return {"ok": True}


@router.get("/api/inject/pending")
async def pending_inject(platform: str | None = None) -> dict:
    """Consume-on-read: returns the slot once, then clears it. A platform
    mismatch returns empty WITHOUT consuming (so the right platform tab gets it)."""
    global _STAGED
    slot = _STAGED
    if slot is None:
        return {"staged": False}
    if platform is not None and slot["platform"] != platform:
        return {"staged": False}
    _STAGED = None
    return {"staged": True, "platform": slot["platform"], "export": slot["export"]}


@router.get("/api/inject/form-map/{platform}")
async def form_map(platform: str) -> dict:
    fm = load_form_map(platform)
    if not fm:
        raise HTTPException(404, f"No form map for platform {platform!r}")
    return fm


def _reset_slot() -> None:
    """Test helper — clear the module slot between tests."""
    global _STAGED
    _STAGED = None
