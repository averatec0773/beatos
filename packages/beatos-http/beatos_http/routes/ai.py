"""/api/ai — in-app AI tagging (EPIC-D4).

`GET /api/ai/status` is read-only (provider, whether a key is set, model, enabled).
`POST /api/tracks/{id}/suggest-tags` runs the live suggestion: cover + title +
existing tags → genre/mood/tags/description, only when AI is enabled and only on
this explicit call. The API key is never returned or logged.
"""
from __future__ import annotations

import logging
import pathlib

from fastapi import APIRouter, HTTPException

from beatos_core.assets.service import get_asset
from beatos_core.tracks.service import get_track

from beatos_http.ai import service as ai_service
from beatos_http.ai.provider import TagSuggestion

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Tracks-namespaced action lives on its own (no /api/ai prefix), mirroring the
# analyze route's path shape.
track_router = APIRouter(tags=["ai"])

# Anthropic rejects images over ~5 MB; skip an oversized cover rather than fail.
_MAX_COVER_BYTES = 5 * 1024 * 1024


@router.get("/status")
async def status() -> dict:
    return await ai_service.get_ai_status()


async def _load_cover(track) -> bytes | None:
    if track.cover_asset_id is None:
        return None
    asset = await get_asset(track.cover_asset_id)
    if asset is None or not asset.abs_path:
        return None
    try:
        data = pathlib.Path(asset.abs_path).read_bytes()
    except OSError:
        return None
    return data if 0 < len(data) <= _MAX_COVER_BYTES else None


@track_router.post("/api/tracks/{track_id}/suggest-tags", response_model=TagSuggestion)
async def suggest_tags(track_id: int) -> TagSuggestion:
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(404, "Track not found")

    provider = await ai_service.get_active_provider()
    if provider is None:
        raise HTTPException(409, "AI tagging is not enabled. Set it up in Settings → AI Assist.")

    cover = await _load_cover(track)
    existing = {
        "genre": track.genre or [],
        "mood": track.mood or [],
        "tags": track.tags or [],
    }
    try:
        return await provider.suggest_tags(title=track.title, cover_png=cover, existing=existing)
    except RuntimeError as e:
        # The provider raises clean, key-free messages (status only).
        raise HTTPException(502, str(e)) from None
    except Exception as e:
        # Never log the key or full error; the type name is enough to diagnose.
        log.warning("suggest_tags failed: %s", type(e).__name__)
        raise HTTPException(500, "AI tagging failed") from None
