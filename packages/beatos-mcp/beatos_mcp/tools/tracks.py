"""list_tracks + get_track tools."""
from __future__ import annotations

import json
from typing import Any

from beatos_core.tracks.sql_filter import build_filter_clauses
from beatos_mcp.db import connect


class TrackNotFound(RuntimeError):
    """Raised when get_track(id) does not match any row."""


# Use fully-qualified column names so the same SELECT works in JOIN queries (T9 uses these).
# Column order == index order in the row builders below — append new columns
# LAST and extend the builder in the same change (see the add-db-field skill).
_TRACK_COLS = (
    "track.id, track.title, track.producer, track.genre, track.mood, "
    "track.key_signature, track.bpm, track.description, "
    "track.created_at, track.updated_at, track.deleted_at, "
    "track.is_free, track.project_path"
)
_ASSET_COLS = "id, track_id, role, abs_path, missing, format"


def _parse_json_array(raw: Any) -> list[str] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    return raw


def _row_to_track(row: tuple) -> dict:
    return {
        "id": row[0],
        "title": row[1],
        "producer": _parse_json_array(row[2]),
        "genre": _parse_json_array(row[3]),
        "mood": _parse_json_array(row[4]),
        "key_signature": row[5],
        "bpm": row[6],
        "description": row[7],
        "created_at": row[8],
        "updated_at": row[9],
        "deleted_at": row[10],
        # Rule 19: is_free = free non-commercial download ALONGSIDE paid tiers.
        "is_free": bool(row[11]),
        "project_path": row[12],
    }


def _row_to_asset(row: tuple) -> dict:
    return {
        "id": row[0],
        "track_id": row[1],
        "role": row[2],
        "abs_path": row[3],
        "missing": bool(row[4]),
        # Rule 18: format is an attribute ('' for non-audio), not part of the role.
        "format": row[5],
    }


async def get_track(track_id: int) -> dict:
    async with connect() as conn:
        async with conn.execute(
            f"SELECT {_TRACK_COLS} FROM track WHERE track.id=? AND track.deleted_at IS NULL",
            (track_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            raise TrackNotFound(f"Track {track_id} does not exist")
        track = _row_to_track(row)

        async with conn.execute(
            f"SELECT {_ASSET_COLS} FROM asset WHERE track_id=? ORDER BY role",
            (track_id,),
        ) as cur:
            asset_rows = await cur.fetchall()
        track["assets"] = [_row_to_asset(r) for r in asset_rows]
    return track


DEFAULT_LIMIT = 50
MAX_LIMIT = 500
# `title` is the canonical sort key; `name` is a backward-compat alias (the field
# is `title`, but the tool enum historically advertised `name`). Both map to the
# `title` column.
_SORTABLE = {"created_at", "updated_at", "bpm", "title", "name"}
_SORT_DIRS = {"asc", "desc"}
_SORT_COL = {"created_at": "created_at", "updated_at": "updated_at",
             "bpm": "bpm", "title": "title", "name": "title"}


def _build_filter_clauses(
    *,
    producers: list[str] | None,
    genres: list[str] | None,
    moods: list[str] | None,
    keys: list[str] | None,
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: float | None,
    bpm_max: float | None,
    has_audio: bool | None,
    text: list[str] | None = None,
) -> tuple[list[str], list]:
    # Shared core builder (HTTP↔MCP parity); MCP scopes to non-deleted rows.
    clauses, params = build_filter_clauses(
        producers=producers, genres=genres, moods=moods, keys=keys,
        producers_like=producers_like, genres_like=genres_like,
        moods_like=moods_like, keys_like=keys_like,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio, text=text,
    )
    return (["track.deleted_at IS NULL", *clauses], params)


async def list_tracks(
    *,
    list_id: int | None = None,
    producers: list[str] | None = None,
    genres: list[str] | None = None,
    moods: list[str] | None = None,
    keys: list[str] | None = None,
    producers_like: list[str] | None = None,
    genres_like: list[str] | None = None,
    moods_like: list[str] | None = None,
    keys_like: list[str] | None = None,
    bpm_min: float | None = None,
    bpm_max: float | None = None,
    has_audio: bool | None = None,
    text: list[str] | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict:
    if sort_by not in _SORTABLE:
        raise ValueError(f"sort_by must be one of {sorted(_SORTABLE)}; got {sort_by!r}")
    if sort_dir not in _SORT_DIRS:
        raise ValueError(f"sort_dir must be 'asc' or 'desc'; got {sort_dir!r}")

    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))

    clauses, params = _build_filter_clauses(
        producers=producers, genres=genres, moods=moods, keys=keys,
        producers_like=producers_like, genres_like=genres_like,
        moods_like=moods_like, keys_like=keys_like,
        bpm_min=bpm_min, bpm_max=bpm_max, has_audio=has_audio, text=text,
    )

    join = ""
    if list_id is not None:
        # Junction table is `track_list` (verified from 002_lists_and_index.sql).
        join = "JOIN track_list tl ON tl.track_id = track.id "
        clauses.append("tl.list_id = ?")
        params.append(list_id)

    where = " AND ".join(clauses)
    sort_col = _SORT_COL[sort_by]

    count_sql = (
        f"SELECT COUNT(DISTINCT track.id) FROM track {join} WHERE {where}"
    )
    list_sql = (
        f"SELECT DISTINCT {_TRACK_COLS} FROM track {join} WHERE {where} "
        f"ORDER BY track.{sort_col} {sort_dir.upper()}, track.id ASC "
        f"LIMIT ? OFFSET ?"
    )

    async with connect() as conn:
        async with conn.execute(count_sql, params) as cur:
            total = (await cur.fetchone())[0]
        async with conn.execute(list_sql, params + [limit, offset]) as cur:
            rows = await cur.fetchall()

    items = [_row_to_track(r) for r in rows]
    out: dict = {
        "items": items,
        "total": total,
        "returned": len(items),
        "limit": limit,
        "offset": offset,
    }
    if total > offset + len(items):
        more = total - (offset + len(items))
        out["hint"] = f"{more} more match. Refine filter or use offset."
    return out
