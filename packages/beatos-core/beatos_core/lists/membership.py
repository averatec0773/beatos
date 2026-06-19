"""Track <-> List membership.

v0.0.4: global DB resolved via BEATOS_DB_PATH (or ~/Music/BeatOS/global.db).
"""
from __future__ import annotations

import datetime as _dt

import aiosqlite

from beatos_core.db import resolve_db_path
from beatos_core.models import List as ListModel
from beatos_core.models import Track
from beatos_core.tracks.service import _SELECT_COLS as _TRACK_SELECT_COLS
from beatos_core.tracks.service import _cover_subquery as _track_cover_subquery
from beatos_core.tracks.service import _has_audio_subquery as _track_has_audio_subquery
from beatos_core.tracks.service import _deserialize as _track_from_row
from beatos_core.tracks.service import _build_where, SORTABLE_FIELDS, SORT_DIRS, MULTI_VALUE_FIELDS
from beatos_core.lists.service import _SELECT_COLS as _LIST_SELECT_COLS
from beatos_core.lists.service import _row_to_list


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


async def add_track_to_list(track_id: int, list_id: int) -> bool:
    """Idempotent insert. Returns True if a row was actually added, False if
    the track was already a member of the list (so callers can distinguish
    "added" from "already in" — silent no-op success used to look like a
    failure in the UI).
    """
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        cursor = await conn.execute(
            "INSERT OR IGNORE INTO track_list (track_id, list_id, position, added_at) "
            "VALUES (?, ?, 0, ?)",
            (track_id, list_id, _now()),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def remove_track_from_list(track_id: int, list_id: int) -> None:
    db_path = resolve_db_path()
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "DELETE FROM track_list WHERE track_id = ? AND list_id = ?",
            (track_id, list_id),
        )
        await conn.commit()


async def tracks_in_list(
    list_id: int,
    *,
    sort_by: str | None = None,
    sort_dir: str = "desc",
    producers: list[str] | None = None,
    genres: list[str] | None = None,
    moods: list[str] | None = None,
    keys: list[str] | None = None,
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: int | None = None,
    bpm_max: int | None = None,
    has_audio: bool | None = None,
    q: str | None = None,
    text: list[str] | None = None,
) -> list[Track]:
    """Return tracks in a list with optional sort + filter.

    When sort_by is None (default), results are ordered by list_track.position
    then track.id — preserving the user-curated order. When sort_by is provided
    it must be a member of SORTABLE_FIELDS.
    """
    if sort_by is not None and sort_by not in SORTABLE_FIELDS:
        raise ValueError(f"sort_by must be one of {sorted(SORTABLE_FIELDS)}; got {sort_by!r}")
    if sort_dir not in SORT_DIRS:
        raise ValueError(f"sort_dir must be 'asc' or 'desc'; got {sort_dir!r}")

    db_path = resolve_db_path()
    # Qualify each column with the `track.` prefix so the join is unambiguous.
    cols = ", ".join(f"track.{c.strip()}" for c in _TRACK_SELECT_COLS.split(","))
    cover_sq = _track_cover_subquery("track.")
    has_audio_sq = _track_has_audio_subquery("track.")

    filter_where, filter_params = _build_where(
        producers=producers, genres=genres, moods=moods, keys=keys,
        producers_like=producers_like, genres_like=genres_like,
        moods_like=moods_like, keys_like=keys_like,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio,
        text=text if text is not None else ([t for t in q.split() if t] if q else None),
    )

    where_clause = "track_list.list_id = ? AND track.deleted_at IS NULL"
    if filter_where:
        where_clause = f"{where_clause} AND {filter_where}"

    params: list = [list_id] + filter_params

    if sort_by is None:
        order_clause = "track_list.position ASC, track.id ASC"
    elif sort_by in MULTI_VALUE_FIELDS:
        order_clause = f"json_extract(track.{sort_by}, '$[0]') {sort_dir.upper()}, track.id ASC"
    else:
        order_clause = f"track.{sort_by} {sort_dir.upper()}, track.id ASC"

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {cols}, {cover_sq}, {has_audio_sq} FROM track "
            "INNER JOIN track_list ON track_list.track_id = track.id "
            f"WHERE {where_clause} "
            f"ORDER BY {order_clause}",
            params,
        ) as cur:
            rows = await cur.fetchall()
    return [_track_from_row(r) for r in rows]


async def lists_for_track(track_id: int) -> list[ListModel]:
    """Return the lists a given track is a member of."""
    db_path = resolve_db_path()
    cols = ", ".join(f"list.{c.strip()}" for c in _LIST_SELECT_COLS.split(","))
    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            f"SELECT {cols} FROM list "
            "INNER JOIN track_list ON track_list.list_id = list.id "
            "WHERE track_list.track_id = ? "
            "ORDER BY list.position, list.id",
            (track_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [_row_to_list(r) for r in rows]
