"""/api/tracks/:id/assets and /api/assets/cover/:id routes."""
from __future__ import annotations

import pathlib

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from beatos_core.assets.move_managed import move_asset_to_managed
from beatos_core.assets.service import (
    OutOfSourceError,
    attach_asset,
    detach_asset,
    get_asset,
    list_assets_for_track,
    relocate_asset,
)
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
    """Attach an asset. Returns 200 with Asset JSON, or 422 with a structured
    {error, path, available_sources} payload when the file lives outside any
    registered Source.
    """
    try:
        asset = await attach_asset(
            track_id, role=payload.role, path=payload.path, replace=replace
        )
    except OutOfSourceError as e:
        return JSONResponse(
            status_code=422,
            content={
                "error": "out_of_source",
                "path": e.path,
                "available_sources": [s.model_dump() for s in e.available_sources],
            },
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


@router.post("/api/tracks/{track_id}/assets/{asset_id}/move")
async def move_into_managed(track_id: int, asset_id: int) -> Response:  # noqa: ARG001
    try:
        await move_asset_to_managed(asset_id)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    return Response(status_code=200)


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
