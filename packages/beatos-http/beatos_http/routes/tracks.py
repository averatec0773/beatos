"""/api/tracks routes.

v0.0.4: tracks are global. TrackUpdate.model_config['extra'] = 'forbid'
makes pydantic return 422 for any unknown field including description_draft.
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, HTTPException, Query, Response

from beatos_core.db import resolve_db_path
from beatos_core.models import Track, TrackCreate, TrackUpdate
from beatos_core.sources.service import get_source
from beatos_core.lists.membership import tracks_in_list
from beatos_core.tracks.service import (
    _SELECT_COLS,
    _cover_subquery,
    _deserialize,
    create_track,
    delete_track,
    get_track,
    list_tracks,
    update_track,
)

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


@router.post("", response_model=Track)
async def create(payload: TrackCreate) -> Track:
    return await create_track(payload.title)


@router.get("", response_model=list[Track])
async def list_all(
    source_id: int | None = Query(default=None),
    list_id: int | None = Query(default=None),
) -> list[Track]:
    if list_id is not None:
        return await tracks_in_list(list_id)

    if source_id is None:
        return await list_tracks()

    src = await get_source(source_id)
    if src is None:
        return []

    qualified_cols = ", ".join(f"t.{c.strip()}" for c in _SELECT_COLS.split(","))
    cover_sq = _cover_subquery("t.")
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT DISTINCT {qualified_cols}, {cover_sq} FROM track t "
            "JOIN asset a ON a.track_id = t.id "
            "WHERE a.abs_path GLOB ? || '/*' OR a.abs_path = ? "
            "ORDER BY t.updated_at DESC",
            (src.root_path, src.root_path),
        ) as cur:
            rows = await cur.fetchall()
    return [_deserialize(r) for r in rows]


@router.get("/{track_id}", response_model=Track)
async def read(track_id: int) -> Track:
    track = await get_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")
    return track


@router.put("/{track_id}", response_model=Track)
async def update(track_id: int, payload: TrackUpdate) -> Track:
    updates = payload.model_dump(exclude_unset=True)
    try:
        return await update_track(track_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{track_id}", status_code=204)
async def remove(track_id: int) -> Response:
    await delete_track(track_id)
    return Response(status_code=204)
