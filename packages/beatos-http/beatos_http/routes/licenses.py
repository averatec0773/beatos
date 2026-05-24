"""/api routes for license tiers.

Endpoints
---------
- GET    /api/tracks/{track_id}/license_tiers          → list tiers
- POST   /api/tracks/{track_id}/license_tiers          → create one tier
- POST   /api/tracks/{track_id}/license_tiers/reorder  → reorder
- PUT    /api/license_tiers/{tier_id}                  → partial update
- DELETE /api/license_tiers/{tier_id}                  → delete
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from beatos_core.licenses.service import (
    create_tier,
    delete_tier,
    list_tiers_for_track,
    reorder_tiers,
    update_tier,
)
from beatos_core.models import LicenseTier, LicenseTierCreate, LicenseTierUpdate


router = APIRouter(prefix="/api", tags=["license-tiers"])


class ReorderPayload(BaseModel):
    ids: list[int]


@router.get("/tracks/{track_id}/license_tiers", response_model=list[LicenseTier])
async def list_for_track(track_id: int) -> list[LicenseTier]:
    return await list_tiers_for_track(track_id)


@router.post("/tracks/{track_id}/license_tiers", response_model=LicenseTier)
async def create(track_id: int, payload: LicenseTierCreate) -> LicenseTier:
    try:
        return await create_tier(
            track_id,
            name=payload.name,
            deliverables=payload.deliverables,
            prices=payload.prices,
            notes=payload.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/tracks/{track_id}/license_tiers/reorder",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reorder(track_id: int, payload: ReorderPayload) -> Response:
    try:
        await reorder_tiers(track_id, payload.ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/license_tiers/{tier_id}", response_model=LicenseTier)
async def update(tier_id: int, payload: LicenseTierUpdate) -> LicenseTier:
    updates = payload.model_dump(exclude_unset=True)
    try:
        return await update_tier(tier_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/license_tiers/{tier_id}", status_code=204)
async def remove(tier_id: int) -> Response:
    try:
        await delete_tier(tier_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(status_code=204)
