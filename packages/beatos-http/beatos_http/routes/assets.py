"""/api/tracks/:id/assets and /api/assets/cover/:id routes."""
from __future__ import annotations

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
    return FileResponse(p, media_type=asset.mime_type or "image/jpeg")


_AUDIO_MIME = {
    "audio_tagged_mp3": "audio/mpeg",
    "audio_untagged_mp3": "audio/mpeg",
    "audio_tagged_wav": "audio/wav",
    "audio_untagged_wav": "audio/wav",
}


@router.get("/api/assets/audio/{asset_id}")
async def audio_stream(asset_id: int) -> FileResponse:
    asset = await get_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.role not in _AUDIO_ROLES:
        raise HTTPException(status_code=400, detail="Asset is not audio.")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Audio file missing.")
    # `loop` can be wav OR mp3, so it has no fixed entry in _AUDIO_MIME — fall
    # back to the file extension (and finally mpeg) when mime_type is unset.
    fallback = _AUDIO_MIME.get(asset.role) or (
        "audio/wav" if p.suffix.lower() == ".wav" else "audio/mpeg"
    )
    return FileResponse(p, media_type=asset.mime_type or fallback)
