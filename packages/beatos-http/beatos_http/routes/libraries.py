"""/api/libraries routes.

Three endpoints — no /activate by id. Switching the active library = POSTing
/init with the target path. Identification is by root_path globally.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from beatos_core.library.service import (
    get_active_library,
    init_library_root,
    list_libraries,
)
from beatos_core.models import Library

router = APIRouter(prefix="/api/libraries", tags=["libraries"])


class InitPayload(BaseModel):
    path: str


@router.post("/init", response_model=Library)
async def init(payload: InitPayload) -> Library:
    return await init_library_root(payload.path)


@router.get("/active", response_model=Library)
async def active() -> Library:
    lib = await get_active_library()
    if lib is None:
        raise HTTPException(status_code=404, detail="No active library.")
    return lib


@router.get("", response_model=list[Library])
async def list_all() -> list[Library]:
    return await list_libraries()
