"""/api/tracks routes.

Returns 409 if no active library. TrackUpdate.model_config['extra'] = 'forbid'
makes pydantic return 422 for any unknown field including description_draft.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from beatos_core import state
from beatos_core.models import Track, TrackCreate, TrackUpdate
from beatos_core.tracks.service import (
    create_track,
    delete_track,
    get_track,
    list_tracks,
    update_track,
)

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


def _require_active_or_409() -> None:
    if state.get_active() is None:
        raise HTTPException(status_code=409, detail="No active library.")


@router.post("", response_model=Track)
async def create(payload: TrackCreate) -> Track:
    _require_active_or_409()
    return await create_track(payload.title)


@router.get("", response_model=list[Track])
async def list_all() -> list[Track]:
    _require_active_or_409()
    return await list_tracks()


@router.get("/{track_id}", response_model=Track)
async def read(track_id: int) -> Track:
    _require_active_or_409()
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return track


@router.put("/{track_id}", response_model=Track)
async def update(track_id: int, payload: TrackUpdate) -> Track:
    _require_active_or_409()
    updates = payload.model_dump(exclude_unset=True)
    try:
        return await update_track(track_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{track_id}", status_code=204)
async def remove(track_id: int) -> Response:
    _require_active_or_409()
    await delete_track(track_id)
    return Response(status_code=204)
