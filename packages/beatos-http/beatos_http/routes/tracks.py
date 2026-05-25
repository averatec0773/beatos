"""/api/tracks routes.

v0.0.4: tracks are global. TrackUpdate.model_config['extra'] = 'forbid'
makes pydantic return 422 for any unknown field.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from beatos_core.models import Track, TrackCreate, TrackUpdate
from beatos_core.lists.membership import tracks_in_list
from beatos_core.tracks.query_parser import parse_query
from beatos_core.tracks.service import (
    count_tracks,
    create_track,
    delete_track,
    get_track,
    list_tracks,
    list_distinct_values,
    list_top_values,
    list_trash,
    purge_all_trash,
    purge_track,
    restore_track,
    update_track,
)
from beatos_core.app_settings.service import get_setting, set_setting

router = APIRouter(prefix="/api/tracks", tags=["tracks"])

_RECENT_KEY = "recent_searches"
_RECENT_CAP = 8


@router.post("", response_model=Track)
async def create(payload: TrackCreate) -> Track:
    return await create_track(payload.title)


@router.get("", response_model=list[Track])
async def list_all(
    list_id: int | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    sort_dir: str = Query(default="desc"),
    producers: list[str] = Query(default_factory=list),
    genres: list[str] = Query(default_factory=list),
    moods: list[str] = Query(default_factory=list),
    keys: list[str] = Query(default_factory=list),
    bpm_min: int | None = Query(default=None),
    bpm_max: int | None = Query(default=None),
    has_audio: bool | None = Query(default=None),
    query: str | None = Query(default=None),
) -> list[Track]:
    try:
        q_terms: list[str] | None = None
        if query:
            spec = parse_query(query)
            producers = list(dict.fromkeys([*producers, *spec.producers]))
            genres = list(dict.fromkeys([*genres, *spec.genres]))
            moods = list(dict.fromkeys([*moods, *spec.moods]))
            keys = list(dict.fromkeys([*keys, *spec.keys]))
            if bpm_min is None:
                bpm_min = spec.bpm_min
            if bpm_max is None:
                bpm_max = spec.bpm_max
            if has_audio is None:
                has_audio = spec.has_audio
            q_terms = (spec.text + spec.tags) or None

        if list_id is not None:
            # When sort_by is absent, tracks_in_list defaults to position order.
            # When sort_by is explicitly provided, pass it through.
            return await tracks_in_list(
                list_id,
                sort_by=sort_by,
                sort_dir=sort_dir,
                producers=producers or None,
                genres=genres or None,
                moods=moods or None,
                keys=keys or None,
                bpm_min=bpm_min,
                bpm_max=bpm_max,
                has_audio=has_audio,
                text=q_terms,
            )

        # For the library view, default to updated_at DESC when not specified.
        effective_sort_by = sort_by if sort_by is not None else "updated_at"

        return await list_tracks(
            sort_by=effective_sort_by,
            sort_dir=sort_dir,
            producers=producers or None,
            genres=genres or None,
            moods=moods or None,
            keys=keys or None,
            bpm_min=bpm_min,
            bpm_max=bpm_max,
            has_audio=has_audio,
            text=q_terms,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/distinct/{field}", response_model=list[str])
async def distinct_values(field: str) -> list[str]:
    try:
        return await list_distinct_values(field)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trash", response_model=list[Track])
async def list_trashed() -> list[Track]:
    return await list_trash()


@router.post("/trash/purge_all")
async def purge_all_trashed() -> dict[str, int]:
    """Hard-delete every track currently in trash. Returns count purged."""
    return {"purged": await purge_all_trash()}


@router.get("/count")
async def get_track_count() -> dict[str, int]:
    """Total count of non-trashed tracks. Used by the sidebar All Beats badge."""
    return {"total": await count_tracks()}


@router.get("/facets")
async def facets(field: str = Query(...), limit: int = Query(default=8)) -> dict:
    try:
        return {"items": await list_top_values(field, limit)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recent-searches")
async def get_recent_searches() -> dict:
    items = await get_setting(_RECENT_KEY)
    return {"items": items if isinstance(items, list) else []}


@router.post("/recent-searches")
async def add_recent_search(payload: dict) -> dict:
    q = (payload.get("query") or "").strip()
    if not q:
        items = await get_setting(_RECENT_KEY)
        return {"items": items if isinstance(items, list) else []}
    items = await get_setting(_RECENT_KEY)
    items = items if isinstance(items, list) else []
    items = [q] + [x for x in items if x != q]
    items = items[:_RECENT_CAP]
    await set_setting(_RECENT_KEY, items)
    return {"items": items}


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


@router.post("/{track_id}/restore", response_model=Track)
async def restore(track_id: int) -> Track:
    try:
        return await restore_track(track_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{track_id}", status_code=204)
async def remove(track_id: int, purge: bool = Query(default=False)) -> Response:
    if purge:
        await purge_track(track_id)
    else:
        await delete_track(track_id)
    return Response(status_code=204)
