"""/api/lists routes — list lifecycle and track membership."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from beatos_core.lists.export import build_export_manifest, package_list
from beatos_core.lists.membership import add_track_to_list, remove_track_from_list
from beatos_core.lists.service import (
    create_list,
    delete_list,
    list_lists,
    reorder_lists,
    update_list,
)
from beatos_core.models import List as ListModel, ListCreate, ListUpdate

router = APIRouter(prefix="/api/lists", tags=["lists"])


class AddTrackPayload(BaseModel):
    track_id: int


class ReorderPayload(BaseModel):
    ids: list[int]


class ExportItem(BaseModel):
    track_id: int
    asset_ids: list[int]


class ExportPackagePayload(BaseModel):
    mode: str  # "zip" | "folder"
    dest: str  # absolute destination folder (picked in the renderer)
    items: list[ExportItem]


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


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_endpoint(payload: ReorderPayload) -> Response:
    try:
        await reorder_lists(payload.ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{list_id}/tracks")
async def add_track(list_id: int, payload: AddTrackPayload) -> dict:
    added = await add_track_to_list(payload.track_id, list_id)
    return {"added": added}


@router.delete("/{list_id}/tracks/{track_id}", status_code=204)
async def remove_track(list_id: int, track_id: int) -> Response:
    await remove_track_from_list(track_id, list_id)
    return Response(status_code=204)


@router.get("/{list_id}/export/manifest")
async def export_manifest(list_id: int) -> list[dict]:
    """Per-track packageable files (for the export dialog's checkboxes)."""
    return await build_export_manifest(list_id)


@router.post("/{list_id}/export/package")
async def export_package(list_id: int, payload: ExportPackagePayload) -> dict:
    """Bundle the selected files into a ZIP or folder under `dest`."""
    try:
        return await package_list(
            list_id,
            [it.model_dump() for it in payload.items],
            mode=payload.mode,
            dest=payload.dest,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
