"""/api/lists routes — list lifecycle and track membership."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from beatos_core.lists.membership import add_track_to_list, remove_track_from_list
from beatos_core.lists.service import (
    create_list,
    delete_list,
    list_lists,
    update_list,
)
from beatos_core.models import List as ListModel, ListCreate, ListUpdate

router = APIRouter(prefix="/api/lists", tags=["lists"])


class AddTrackPayload(BaseModel):
    track_id: int


@router.get("", response_model=list[ListModel])
async def list_all() -> list[ListModel]:
    return await list_lists()


@router.post("", response_model=ListModel)
async def create(payload: ListCreate) -> ListModel:
    try:
        return await create_list(name=payload.name, kind=payload.kind)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{list_id}", response_model=ListModel)
async def update(list_id: int, payload: ListUpdate) -> ListModel:
    updates = payload.model_dump(exclude_unset=True)
    try:
        return await update_list(list_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{list_id}", status_code=204)
async def remove(list_id: int) -> Response:
    try:
        await delete_list(list_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(status_code=204)


@router.post("/{list_id}/tracks")
async def add_track(list_id: int, payload: AddTrackPayload) -> Response:
    await add_track_to_list(payload.track_id, list_id)
    return Response(status_code=200)


@router.delete("/{list_id}/tracks/{track_id}", status_code=204)
async def remove_track(list_id: int, track_id: int) -> Response:
    await remove_track_from_list(track_id, list_id)
    return Response(status_code=204)
