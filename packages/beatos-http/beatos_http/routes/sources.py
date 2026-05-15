"""/api/sources routes — CRUD + status.

v0.0.4: Sources are globally-scoped. Service functions resolve the global DB
internally via resolve_db_path() so no FastAPI dependency injection is needed
for the connection.
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from beatos_core.db import resolve_db_path
from beatos_core.sources.models import (
    Source,
    SourceCreate,
    SourceStatus,
    SourceUpdate,
)
from beatos_core.sources.service import (
    create_source,
    delete_source,
    get_source,
    get_source_status,
    list_sources,
    update_source,
)

router = APIRouter(prefix="/api/sources", tags=["sources"])


class SourceWithStatus(BaseModel):
    id: int
    name: str
    root_path: str
    position: int
    created_at: str
    status: str  # "online" | "offline"
    track_count: int


async def _track_count_for_source(root_path: str) -> int:
    """Count distinct tracks with at least one asset under this Source's root_path."""
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT COUNT(DISTINCT t.id) FROM track t "
            "JOIN asset a ON a.track_id = t.id "
            "WHERE a.abs_path GLOB ? || '/*' OR a.abs_path = ?",
            (root_path, root_path),
        ) as cur:
            row = await cur.fetchone()
    return int(row[0]) if row else 0


@router.get("", response_model=list[SourceWithStatus])
async def list_endpoint() -> list[SourceWithStatus]:
    sources = await list_sources()
    out: list[SourceWithStatus] = []
    for s in sources:
        st = await get_source_status(s.id)
        tc = await _track_count_for_source(s.root_path)
        out.append(
            SourceWithStatus(
                **s.model_dump(),
                status=st.status if st else "offline",
                track_count=tc,
            )
        )
    return out


@router.post("", response_model=Source, status_code=status.HTTP_201_CREATED)
async def create_endpoint(payload: SourceCreate) -> Source:
    try:
        return await create_source(payload)
    except ValueError as e:
        msg = str(e)
        if "already registered" in msg:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=msg)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=msg)


@router.patch("/{source_id}", response_model=Source)
async def update_endpoint(source_id: int, payload: SourceUpdate) -> Source:
    try:
        updated = await update_source(source_id, payload)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Source not found")
    return updated


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_endpoint(source_id: int) -> Response:
    if await get_source(source_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Source not found")
    await delete_source(source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{source_id}/status", response_model=SourceStatus)
async def status_endpoint(source_id: int) -> SourceStatus:
    st = await get_source_status(source_id)
    if st is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Source not found")
    return st
