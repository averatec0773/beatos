from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from beatos_core.app_settings.service import get_setting
from beatos_core.licenses.service import replace_tiers_for_track
from beatos_core.tracks.service import bulk_update_tracks

router = APIRouter(tags=["bulk"])

DEFAULT_LICENSE_KEY = "default_license_tiers"


class _BulkUpdate(BaseModel):
    ids: list[int]
    patch: dict


class _BulkIds(BaseModel):
    ids: list[int]


@router.post("/api/tracks/bulk-update")
async def bulk_update(req: _BulkUpdate) -> dict:
    try:
        return await bulk_update_tracks(req.ids, req.patch)
    except KeyError as e:
        raise HTTPException(400, f"Unknown field: {e}")


@router.post("/api/tracks/bulk-apply-license-template")
async def bulk_apply_license_template(req: _BulkIds) -> dict:
    tiers = await get_setting(DEFAULT_LICENSE_KEY)
    if not tiers:
        raise HTTPException(400, "No default license tiers configured")
    applied = 0
    for tid in req.ids:
        try:
            await replace_tiers_for_track(tid, tiers)
            applied += 1
        except ValueError:
            continue
    return {"applied": applied, "ids": req.ids}
