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

router = APIRouter(tags=["inject"])
read_router = APIRouter(tags=["inject"])

# Overwrite-style single slot. Phase 1 holds one staged fill at a time.
_STAGED: dict | None = None

# Main-app ephemeral port, advertised via /ping so the extension can DISCOVER
# the token-gated main API from the fixed port (rule 10 revised: the fixed port
# stays read-only — discovery only, all writes token-gated on the main app).
# Set once at startup by __main__ via create_inject_app(main_port=...); None
# when unknown (bare create_app in tests, fixed port unbound).
_MAIN_PORT: int | None = None


def set_main_port(port: int | None) -> None:
    global _MAIN_PORT
    _MAIN_PORT = port


class StageRequest(BaseModel):
    track_id: int
    platform: str


@read_router.get("/api/inject/ping")
async def inject_ping() -> dict:
    """Liveness + identity marker so the extension confirms it's BeatOS, plus
    the main-app port for discovery (both apps share this module singleton, so
    the main app's own /ping reports the same value — or null when unset)."""
    return {"beatos_inject": True, "main_port": _MAIN_PORT}


@router.post("/api/inject/stage")
async def stage_inject(req: StageRequest) -> dict:
    global _STAGED
    try:
        export = await export_metadata(req.track_id, req.platform)
    except ValueError as e:
        raise HTTPException(400, str(e))
    _STAGED = {"platform": req.platform, "export": export.model_dump()}
    return {"ok": True}


@read_router.get("/api/inject/pending")
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


@read_router.get("/api/inject/form-map/{platform}")
async def form_map(platform: str) -> dict:
    # Legacy: the browser extension is archived and platform recipes are private.
    # The form-map served here is intentionally empty.
    return {}


def _reset_slot() -> None:
    """Test helper — clear the module slot between tests."""
    global _STAGED
    _STAGED = None
