"""/api/tracks/:id/assets and /api/assets/cover/:id routes."""
from __future__ import annotations

import asyncio
import pathlib

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from beatos_core.assets.service import (
    attach_asset,
    detach_asset,
    get_asset,
    list_assets_for_track,
    relocate_asset,
)
from beatos_core.assets._constants import AUDIO_ROLES as _AUDIO_ROLES
from beatos_core.models import Asset, AssetCreate
from beatos_http.wav_repair import repair_wav_if_needed, wav_needs_repair

router = APIRouter(tags=["assets"])


class RelocatePayload(BaseModel):
    new_path: str


@router.get("/api/tracks/{track_id}/assets", response_model=list[Asset])
async def list_for_track(track_id: int) -> list[Asset]:
    return await list_assets_for_track(track_id)


@router.post("/api/tracks/{track_id}/assets")
async def attach(
    track_id: int,
    payload: AssetCreate,
    replace: bool = Query(default=False),
):
    """Attach an asset. Returns 200 with Asset JSON."""
    try:
        asset = await attach_asset(
            track_id, role=payload.role, path=payload.path, replace=replace
        )
    except ValueError as e:
        msg = str(e)
        if "already has" in msg:
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    return JSONResponse(status_code=200, content=asset.model_dump(mode="json"))


@router.delete("/api/tracks/{track_id}/assets/{asset_id}", status_code=204)
async def detach(track_id: int, asset_id: int) -> Response:  # noqa: ARG001
    await detach_asset(asset_id)
    return Response(status_code=204)


@router.post("/api/tracks/{track_id}/assets/{asset_id}/relocate", response_model=Asset)
async def relocate(track_id: int, asset_id: int, payload: RelocatePayload) -> Asset:  # noqa: ARG001
    try:
        return await relocate_asset(asset_id, new_path=payload.new_path)
    except ValueError as e:
        msg = str(e)
        if "sha256" in msg.lower():
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


@router.get("/api/assets/cover/{asset_id}")
async def cover_stream(asset_id: int) -> FileResponse:
    asset = await get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.role != "cover":
        raise HTTPException(status_code=400, detail="Asset is not a cover.")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Cover file missing.")
    # Covers are immutable per asset id (replacing a cover mints a NEW id), so
    # let the browser cache them — otherwise every <img> remount re-fetches and
    # the cover visibly reloads. Mirrors the Electron beatos-asset:// proxy.
    return FileResponse(
        p,
        media_type=asset.mime_type or "image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


_FORMAT_MIME = {"wav": "audio/wav", "mp3": "audio/mpeg", "flac": "audio/flac"}


@router.get("/api/assets/audio/{asset_id}")
async def audio_stream(asset_id: int) -> Response:
    asset = await get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.role not in _AUDIO_ROLES:
        raise HTTPException(status_code=400, detail="Asset is not audio.")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Audio file missing.")
    # Format (asset.format: wav/mp3/flac) is authoritative for content-type now;
    # fall back to the stored mime / extension only if format is somehow unset.
    media = (
        _FORMAT_MIME.get(asset.format)
        or asset.mime_type
        or ("audio/wav" if p.suffix.lower() == ".wav" else "audio/mpeg")
    )
    if media in ("audio/x-wav", "audio/vnd.wave"):
        media = "audio/wav"

    is_wav = asset.format == "wav" or p.suffix.lower() == ".wav"
    if is_wav:
        # Clean WAVs stay on a range-capable FileResponse (decodeAudioData and
        # the audio element handle them fine). Only DAW WAVs with extra RIFF
        # chunks / EXTENSIBLE fmt are buffered + sanitized so Chromium can
        # decode them — matching what the Electron beatos-asset:// proxy did.
        def _scan() -> bool:
            with open(p, "rb") as f:
                return wav_needs_repair(f)

        if await asyncio.to_thread(_scan):
            raw = await asyncio.to_thread(p.read_bytes)
            repaired = await asyncio.to_thread(repair_wav_if_needed, raw)
            return Response(
                content=repaired,
                media_type="audio/wav",
                headers={"Cache-Control": "no-store"},
            )
        return FileResponse(p, media_type="audio/wav")

    return FileResponse(p, media_type=media)
