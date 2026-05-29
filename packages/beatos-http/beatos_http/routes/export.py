from fastapi import APIRouter, HTTPException

from beatos_core.export.models import ExportResult
from beatos_core.export.service import available_platforms, export_metadata

router = APIRouter(tags=["export"])


@router.get("/api/export/platforms")
async def list_export_platforms() -> dict:
    return {"platforms": available_platforms()}


@router.get("/api/tracks/{track_id}/export", response_model=ExportResult)
async def export_track(track_id: int, platform: str) -> ExportResult:
    try:
        return await export_metadata(track_id, platform)
    except ValueError as e:
        raise HTTPException(400, str(e))
